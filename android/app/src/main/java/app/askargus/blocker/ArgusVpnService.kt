package app.askargus.blocker

import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import app.askargus.ArgusApp
import app.askargus.MainActivity
import app.askargus.data.ActivityEvent
import kotlinx.coroutines.CompletableJob
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

/**
 * DNS-only VPN that blocks known scam/phishing sites.
 *
 * Routes only a fake DNS address (10.111.222.53 / fd00:a7:5::53) through the VPN
 * tunnel and sets it as the device DNS server. Normal traffic never enters the app.
 *
 * For each DNS query:
 * - Parse the queried hostname
 * - If blocked → answer NXDOMAIN and post a notification
 * - If allowed or not blocked → forward to the real DNS and relay the response
 */
class ArgusVpnService : VpnService() {

    companion object {
        private const val TAG = "ArgusVpn"
        private const val FAKE_DNS4 = "10.111.222.53"
        private const val FAKE_DNS6 = "fd00:a7:5::53"
        const val ACTION_STOP = "app.askargus.STOP_VPN"

        @Volatile
        var running = false
            private set
    }

    private var tunnel: ParcelFileDescriptor? = null
    private var serviceJob: CompletableJob? = null
    private var serviceScope: CoroutineScope? = null

    private fun ensureScope(): CoroutineScope {
        val existing = serviceScope
        val job = serviceJob
        if (existing != null && job != null && job.isActive) {
            return existing
        }
        val newJob = SupervisorJob()
        val newScope = CoroutineScope(newJob + Dispatchers.IO)
        serviceJob = newJob
        serviceScope = newScope
        return newScope
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stop()
            return START_NOT_STICKY
        }
        if (running) return START_STICKY

        val scope = ensureScope()
        val app = applicationContext as? ArgusApp
        app?.container?.let { container ->
            scope.launch {
                val allowed = container.prefs.allowedSites.first()
                BlockerState.setAllowed(allowed)
            }
        }
        if (BlockerState.hostIndex == HostIndex.EMPTY) {
            BlocklistWorker.loadFromDisk(this)
        }

        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                BlockerNotifications.SERVICE_ID,
                BlockerNotifications.serviceNotification(this),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(BlockerNotifications.SERVICE_ID, BlockerNotifications.serviceNotification(this))
        }
        startTunnel()
        return START_STICKY
    }

    private fun startTunnel() {
        val builder = Builder()
            .setSession("Argus blocker")
            .addAddress("10.111.222.1", 32)
            .addAddress("fd00:a7:5::1", 128)
            .addRoute(FAKE_DNS4, 32)
            .addRoute(FAKE_DNS6, 128)
            .addDnsServer(FAKE_DNS4)
            .addDnsServer(FAKE_DNS6)
            .setMtu(1500)
            .setBlocking(true)

        val pi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        builder.setConfigureIntent(pi)

        tunnel = builder.establish()
        if (tunnel == null) {
            Log.w(TAG, "VPN permission not granted")
            stop()
            return
        }

        // Direct underlying networks so physical traffic is never confused by the VPN
        val physical = getPhysicalNetwork()
        if (physical != null) {
            setUnderlyingNetworks(arrayOf(physical))
        } else {
            setUnderlyingNetworks(null)
        }

        running = true
        val scope = ensureScope()
        scope.launch { dnsLoop() }
    }

    private fun dnsLoop() {
        val tun = tunnel ?: return
        val input = FileInputStream(tun.fileDescriptor)
        val output = FileOutputStream(tun.fileDescriptor)
        val buffer = ByteArray(32767)

        try {
            while (running) {
                val len = input.read(buffer)
                if (len <= 0) {
                    Thread.sleep(10)
                    continue
                }
                val packet = buffer.copyOf(len)
                val scope = ensureScope()
                scope.launch { handlePacket(packet, output) }
            }
        } catch (e: Exception) {
            if (running) Log.e(TAG, "DNS loop error", e)
        }
    }

    private suspend fun handlePacket(ipPacket: ByteArray, output: FileOutputStream) {
        try {
            if (ipPacket.isEmpty()) return
            val ipVersion = (ipPacket[0].toInt() shr 4) and 0xF
            if (ipVersion != 4 && ipVersion != 6) return

            // Check if this is a TCP attempt (e.g. DoT probe on port 853 or TCP DNS on port 53)
            val proto = if (ipVersion == 4) {
                if (ipPacket.size > 9) ipPacket[9].toInt() and 0xFF else 0
            } else {
                if (ipPacket.size > 6) ipPacket[6].toInt() and 0xFF else 0
            }

            if (proto == 6) { // TCP
                val rstPacket = DnsPacket.buildTcpRst(ipPacket, ipVersion)
                if (rstPacket != null) {
                    synchronized(output) {
                        output.write(rstPacket)
                    }
                }
                return
            }

            if (proto != 17) return // ignore non-UDP/non-TCP

            val (dnsPayload, ipHeaderLen, transportHeaderLen, srcPort) = when (ipVersion) {
                4 -> parseIpv4Udp(ipPacket) ?: return
                6 -> parseIpv6Udp(ipPacket) ?: return
                else -> return
            }

            val name = DnsPacket.parseName(dnsPayload)
            val index = BlockerState.hostIndex
            val responsePayload: ByteArray

            if (name != null && index.blocked(name) && !BlockerState.isAllowed(name)) {
                // Blocked — send NXDOMAIN
                responsePayload = DnsPacket.nxdomain(dnsPayload)
                val app = if (BlockerState.shouldReport(name)) applicationContext as? ArgusApp else null
                if (app != null) {
                    BlockerState.recordBlock(name)
                    BlockerNotifications.blocked(this, name)
                }
                app?.container?.let { container ->
                    val scope = ensureScope()
                    scope.launch {
                        container.activity.add(
                            ActivityEvent(
                                at = System.currentTimeMillis(),
                                type = "site",
                                kind = "site",
                                subject = name,
                                score = 90,
                                level = "HIGH RISK",
                                verified = true,
                                source = "blocker",
                            ),
                        )
                    }
                }
            } else {
                // Forward to real DNS (or if unparsed query like PTR, forward it safely)
                val rawResponse = forwardDns(dnsPayload) ?: return
                responsePayload = DnsPacket.rewriteId(rawResponse, dnsPayload)
            }

            // Build response IP packet with RFC-compliant checksums
            val responseIp = DnsPacket.buildResponsePacket(
                ipPacket, ipVersion, ipHeaderLen, transportHeaderLen,
                srcPort, responsePayload,
            )
            synchronized(output) {
                output.write(responseIp)
            }
        } catch (e: Exception) {
            Log.w(TAG, "handlePacket error", e)
        }
    }

    private data class UdpInfo(
        val dnsPayload: ByteArray,
        val ipHeaderLen: Int,
        val transportHeaderLen: Int,
        val srcPort: Int,
    )

    private fun parseIpv4Udp(packet: ByteArray): UdpInfo? {
        if (packet.size < 28) return null
        val ihl = (packet[0].toInt() and 0x0F) * 4
        if (ihl < 20 || packet.size < ihl + 8) return null
        val proto = packet[9].toInt() and 0xFF
        if (proto != 17) return null // not UDP
        val udpStart = ihl
        val srcPort = ((packet[udpStart].toInt() and 0xFF) shl 8) or (packet[udpStart + 1].toInt() and 0xFF)
        val udpLen = ((packet[udpStart + 4].toInt() and 0xFF) shl 8) or (packet[udpStart + 5].toInt() and 0xFF)
        if (udpLen < 8 || packet.size < udpStart + udpLen) return null
        val dnsStart = udpStart + 8
        val payloadLen = udpLen - 8
        return UdpInfo(packet.copyOfRange(dnsStart, dnsStart + payloadLen), ihl, 8, srcPort)
    }

    private fun parseIpv6Udp(packet: ByteArray): UdpInfo? {
        if (packet.size < 48) return null
        val nextHeader = packet[6].toInt() and 0xFF
        if (nextHeader != 17) return null // not UDP
        val udpStart = 40
        val srcPort = ((packet[udpStart].toInt() and 0xFF) shl 8) or (packet[udpStart + 1].toInt() and 0xFF)
        val udpLen = ((packet[udpStart + 4].toInt() and 0xFF) shl 8) or (packet[udpStart + 5].toInt() and 0xFF)
        if (udpLen < 8 || packet.size < udpStart + udpLen) return null
        val dnsStart = udpStart + 8
        val payloadLen = udpLen - 8
        return UdpInfo(packet.copyOfRange(dnsStart, dnsStart + payloadLen), 40, 8, srcPort)
    }

    private fun forwardDns(query: ByteArray): ByteArray? {
        val realDns = getRealDnsServers()
        val physicalNetwork = getPhysicalNetwork()

        for (dns in realDns) {
            try {
                DatagramSocket().use { socket ->
                    protect(socket)
                    if (physicalNetwork != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                        try {
                            physicalNetwork.bindSocket(socket)
                        } catch (e: Exception) {
                            Log.d(TAG, "bindSocket error: ${e.message}")
                        }
                    }
                    socket.soTimeout = 1500
                    val addr = InetAddress.getByName(dns)
                    val sendPacket = DatagramPacket(query, query.size, addr, 53)
                    socket.send(sendPacket)

                    val buf = ByteArray(4096)
                    val resp = DatagramPacket(buf, buf.size)
                    socket.receive(resp)
                    if (resp.length > 0) {
                        return buf.copyOf(resp.length)
                    }
                }
            } catch (e: Exception) {
                Log.d(TAG, "DNS forward to $dns failed: ${e.message}")
            }
        }
        return null
    }

    private fun getPhysicalNetwork(): Network? {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return null
        val networks = cm.allNetworks
        var cellularNet: Network? = null
        for (net in networks) {
            val caps = cm.getNetworkCapabilities(net) ?: continue
            if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                return net
            }
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                cellularNet = net
            }
        }
        return cellularNet
    }

    private fun getRealDnsServers(): List<String> {
        val cm = getSystemService(ConnectivityManager::class.java)
        val dnsList = LinkedHashSet<String>()

        if (cm != null) {
            try {
                val networks = cm.allNetworks
                for (network in networks) {
                    val caps = cm.getNetworkCapabilities(network) ?: continue
                    if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
                    if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue

                    val lp = cm.getLinkProperties(network) ?: continue
                    for (inetAddr in lp.dnsServers) {
                        val host = inetAddr.hostAddress ?: continue
                        if (isValidUpstreamDns(host)) {
                            dnsList.add(host)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error enumerating physical network DNS", e)
            }
        }

        // Fast public DNS fallbacks
        dnsList.add("1.1.1.1")
        dnsList.add("8.8.8.8")
        dnsList.add("1.0.0.1")
        dnsList.add("8.8.4.4")

        return dnsList.toList()
    }

    private fun isValidUpstreamDns(ip: String): Boolean {
        if (ip.isBlank()) return false
        // Exclude fake DNS and tunnel interface addresses to prevent loops
        if (ip == FAKE_DNS4 || ip == FAKE_DNS6 || ip == "10.111.222.1" || ip == "fd00:a7:5::1") return false
        if (ip.startsWith("10.111.222.")) return false
        if (ip.startsWith("fd00:a7:5:")) return false
        // Exclude loopback
        if (ip.startsWith("127.") || ip == "::1") return false
        // Exclude IPv6 link-local
        if (ip.startsWith("fe80:", ignoreCase = true)) return false
        return true
    }

    private fun stop() {
        running = false
        serviceJob?.cancel()
        serviceJob = null
        serviceScope = null
        tunnel?.close()
        tunnel = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onRevoke() {
        super.onRevoke()
        running = false
        serviceJob?.cancel()
        serviceJob = null
        serviceScope = null
        tunnel?.close()
        tunnel = null
        val app = applicationContext as? ArgusApp
        app?.container?.let { container ->
            CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                container.prefs.setBlockerEnabled(false)
            }
        }
        BlockerNotifications.revoked(this)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stop()
        super.onDestroy()
    }
}
