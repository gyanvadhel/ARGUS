package app.askargus.ui.scan

import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import app.askargus.AppContainer
import app.askargus.read.ImageReader
import app.askargus.scan.ScanFlow
import app.askargus.scan.ScanState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ScanViewModel(private val flow: ScanFlow, private val reader: ImageReader) : ViewModel() {
    private val _state = MutableStateFlow<ScanState>(ScanState.Idle)
    val state: StateFlow<ScanState> = _state.asStateFlow()
    private val _draft = MutableStateFlow("")
    val draft: StateFlow<String> = _draft.asStateFlow()

    fun setDraft(text: String) {
        _draft.value = text
    }

    fun check(input: String, source: String) {
        _draft.value = input
        launchScan(ScanState.Checking(input.trim())) { flow.check(input, source) }
    }

    fun qr(raw: String, source: String = "qr") = launchScan(ScanState.Checking(raw)) {
        flow.fromQr(raw, source).also { if (it is ScanState.Done) _draft.value = it.input }
    }

    fun image(uri: Uri) = launchScan(ScanState.Reading("Looking for a QR code…")) {
        flow.fromImage({ reader.qr(uri) }, { reader.words(uri) }) { stage ->
            _state.value = stage
            if (stage is ScanState.Checking) _draft.value = stage.input
        }
    }

    fun retry() {
        when (val s = _state.value) {
            is ScanState.NeedsSignIn -> check(s.input, s.source)
            is ScanState.Failed -> s.input?.let { check(it, "retry") }
            else -> Unit
        }
    }

    fun reset() {
        _state.value = ScanState.Idle
        _draft.value = ""
    }

    private fun launchScan(first: ScanState, block: suspend () -> ScanState) {
        _state.value = first
        viewModelScope.launch { _state.value = block() }
    }
}

/** One scanner for the whole app, so Home's quick actions, the QR camera and shared items all land on the Scan screen. */
@Composable
fun scanViewModel(container: AppContainer): ScanViewModel {
    val activity = LocalContext.current as ComponentActivity
    return viewModel(viewModelStoreOwner = activity) {
        ScanViewModel(
            ScanFlow(container.api, { container.account.restore() != null }, { container.activity.add(it) }),
            container.reader,
        )
    }
}
