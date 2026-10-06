package app.askargus.blocker

import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import app.askargus.ArgusApp
import app.askargus.MainActivity
import app.askargus.R
import app.askargus.data.ActivityEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.nio.ByteBuffer

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
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stop()
            return START_NOT_STICKY
        }
        if (running) return START_STICKY

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
        running = true
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
                scope.launch { handlePacket(packet, output) }
            }
        } catch (e: Exception) {
            if (running) Log.e(TAG, "DNS loop error", e)
        }
    }

    private suspend fun handlePacket(ipPacket: ByteArray, output: FileOutputStream) {
        try {
            // Parse IP header to get the DNS payload
            val ipVersion = (ipPacket[0].toInt() shr 4) and 0xF
            val (dnsPayload, ipHeaderLen, transportHeaderLen, srcPort) = when (ipVersion) {
                4 -> parseIpv4Udp(ipPacket) ?: return
                6 -> parseIpv6Udp(ipPacket) ?: return
                else -> return
            }

            val name = DnsPacket.parseName(dnsPayload) ?: return

            val index = BlockerState.hostIndex
            val responsePayload: ByteArray

            if (index.blocked(name) && !BlockerState.isAllowed(name)) {
                // Blocked — send NXDOMAIN
                responsePayload = DnsPacket.nxdomain(dnsPayload)
                BlockerState.recordBlock(name)
                BlockerNotifications.blocked(this, name)
                val app = applicationContext as? ArgusApp
                app?.container?.let { container ->
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
                // Forward to real DNS
                responsePayload = forwardDns(dnsPayload) ?: return
            }

            // Build response IP packet
            val responseIp = buildResponsePacket(
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
        val proto = packet[9].toInt() and 0xFF
        if (proto != 17) return null // not UDP
        val udpStart = ihl
        if (packet.size < udpStart + 8) return null
        val srcPort = ((packet[udpStart].toInt() and 0xFF) shl 8) or (packet[udpStart + 1].toInt() and 0xFF)
        val udpLen = ((packet[udpStart + 4].toInt() and 0xFF) shl 8) or (packet[udpStart + 5].toInt() and 0xFF)
        val dnsStart = udpStart + 8
        if (packet.size < dnsStart + udpLen - 8) return null
        return UdpInfo(packet.copyOfRange(dnsStart, dnsStart + udpLen - 8), ihl, 8, srcPort)
    }

    private fun parseIpv6Udp(packet: ByteArray): UdpInfo? {
        if (packet.size < 48) return null
        val nextHeader = packet[6].toInt() and 0xFF
        if (nextHeader != 17) return null // not UDP
        val udpStart = 40
        if (packet.size < udpStart + 8) return null
        val srcPort = ((packet[udpStart].toInt() and 0xFF) shl 8) or (packet[udpStart + 1].toInt() and 0xFF)
        val udpLen = ((packet[udpStart + 4].toInt() and 0xFF) shl 8) or (packet[udpStart + 5].toInt() and 0xFF)
        val dnsStart = udpStart + 8
        if (packet.size < dnsStart + udpLen - 8) return null
        return UdpInfo(packet.copyOfRange(dnsStart, dnsStart + udpLen - 8), 40, 8, srcPort)
    }

    private fun forwardDns(query: ByteArray): ByteArray? {
        val realDns = getRealDnsServers()
        for (dns in realDns) {
            try {
                val socket = DatagramSocket()
                protect(socket)
                socket.soTimeout = 5000
                val addr = InetAddress.getByName(dns)
                socket.send(DatagramPacket(query, query.size, addr, 53))
                val buf = ByteArray(4096)
                val resp = DatagramPacket(buf, buf.size)
                socket.receive(resp)
                socket.close()
                return buf.copyOf(resp.length)
            } catch (e: Exception) {
                Log.w(TAG, "DNS forward to $dns failed", e)
            }
        }
        return null
    }

    private fun getRealDnsServers(): List<String> {
        val cm = getSystemService(ConnectivityManager::class.java)
        val network = cm.activeNetwork
        val lp = if (network != null) cm.getLinkProperties(network) else null
        val servers = lp?.dnsServers?.map { it.hostAddress ?: "" }?.filter { it.isNotEmpty() }
        return if (servers.isNullOrEmpty()) listOf("1.1.1.1", "1.0.0.1") else servers
    }

    private fun buildResponsePacket(
        originalPacket: ByteArray,
        ipVersion: Int,
        ipHeaderLen: Int,
        transportHeaderLen: Int,
        srcPort: Int,
        dnsPayload: ByteArray,
    ): ByteArray {
        // Swap src/dst in IP header, swap ports in UDP, replace payload
        val udpLen = transportHeaderLen + dnsPayload.size
        val totalLen = ipHeaderLen + udpLen
        val result = ByteArray(totalLen)

        // Copy IP header
        System.arraycopy(originalPacket, 0, result, 0, ipHeaderLen)

        if (ipVersion == 4) {
            // Swap src/dst IP addresses (offsets 12-15 and 16-19)
            System.arraycopy(originalPacket, 12, result, 16, 4)
            System.arraycopy(originalPacket, 16, result, 12, 4)
            // Update total length
            result[2] = ((totalLen shr 8) and 0xFF).toByte()
            result[3] = (totalLen and 0xFF).toByte()
            // Clear checksum, recalculate
            result[10] = 0; result[11] = 0
            val cksum = ipv4Checksum(result, ipHeaderLen)
            result[10] = ((cksum shr 8) and 0xFF).toByte()
            result[11] = (cksum and 0xFF).toByte()
        } else {
            // IPv6: swap src/dst (offsets 8-23 and 24-39)
            System.arraycopy(originalPacket, 8, result, 24, 16)
            System.arraycopy(originalPacket, 24, result, 8, 16)
            // Update payload length
            val payloadLen = udpLen
            result[4] = ((payloadLen shr 8) and 0xFF).toByte()
            result[5] = (payloadLen and 0xFF).toByte()
        }

        // Build UDP header: swap ports
        val udpStart = ipHeaderLen
        // dst port becomes src port (53), src port becomes dst port
        result[udpStart] = 0; result[udpStart + 1] = 53 // src = 53
        result[udpStart + 2] = ((srcPort shr 8) and 0xFF).toByte()
        result[udpStart + 3] = (srcPort and 0xFF).toByte()
        result[udpStart + 4] = ((udpLen shr 8) and 0xFF).toByte()
        result[udpStart + 5] = (udpLen and 0xFF).toByte()
        result[udpStart + 6] = 0; result[udpStart + 7] = 0 // checksum = 0 (optional for UDP over IPv4)

        // Copy DNS payload
        System.arraycopy(dnsPayload, 0, result, udpStart + 8, dnsPayload.size)
        return result
    }

    private fun ipv4Checksum(header: ByteArray, length: Int): Int {
        var sum = 0
        for (i in 0 until length step 2) {
            val word = ((header[i].toInt() and 0xFF) shl 8) or
                    (if (i + 1 < length) header[i + 1].toInt() and 0xFF else 0)
            sum += word
        }
        while (sum shr 16 != 0) sum = (sum and 0xFFFF) + (sum shr 16)
        return sum.inv() and 0xFFFF
    }

    private fun stop() {
        running = false
        scope.cancel()
        tunnel?.close()
        tunnel = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onRevoke() {
        super.onRevoke()
        running = false
        scope.cancel()
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
