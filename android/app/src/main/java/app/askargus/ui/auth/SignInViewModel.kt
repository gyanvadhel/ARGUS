package app.askargus.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.askargus.net.Account
import app.askargus.net.AuthException
import app.askargus.net.SignUpResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException

class SignInViewModel(private val account: Account) : ViewModel() {
    enum class Mode { SIGN_IN, CREATE }

    data class UiState(
        val mode: Mode = Mode.SIGN_IN,
        val busy: Boolean = false,
        val error: String? = null,
        val notice: String? = null,
        val done: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun setMode(mode: Mode) = _state.update { it.copy(mode = mode, error = null, notice = null) }

    fun submit(name: String, email: String, password: String) {
        val current = _state.value
        if (current.busy) return
        validate(current.mode, name, email, password)?.let { problem ->
            _state.update { it.copy(error = problem, notice = null) }
            return
        }
        launchAuth {
            if (current.mode == Mode.SIGN_IN) {
                account.signIn(email, password)
                _state.update { it.copy(busy = false, done = true) }
            } else when (account.signUp(name, email, password)) {
                is SignUpResult.SignedIn -> _state.update { it.copy(busy = false, done = true) }
                SignUpResult.CheckInbox -> _state.update {
                    it.copy(busy = false, mode = Mode.SIGN_IN, notice = "Check your inbox: we sent a link to confirm your email. Then sign in here.")
                }
                SignUpResult.AlreadyRegistered -> _state.update {
                    it.copy(busy = false, mode = Mode.SIGN_IN, error = "That email already has an account. Sign in instead.")
                }
            }
        }
    }

    fun google(idToken: String, rawNonce: String) {
        if (_state.value.busy) return
        launchAuth {
            account.signInWithGoogle(idToken, rawNonce)
            _state.update { it.copy(busy = false, done = true) }
        }
    }

    fun googleFailed(message: String) = _state.update { it.copy(error = message, notice = null) }

    private fun launchAuth(block: suspend () -> Unit) {
        _state.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            try {
                block()
            } catch (e: AuthException) {
                _state.update { it.copy(busy = false, error = e.message) }
            } catch (e: IOException) {
                _state.update { it.copy(busy = false, error = "Couldn't reach Argus. Check your connection.") }
            }
        }
    }

    companion object {
        fun validate(mode: Mode, name: String, email: String, password: String): String? = when {
            mode == Mode.CREATE && name.isBlank() -> "Tell us your name."
            !email.contains('@') -> "Enter your email address."
            password.isEmpty() -> "Enter your password."
            mode == Mode.CREATE && password.length < 8 -> "Use at least 8 characters for your password."
            else -> null
        }
    }
}
