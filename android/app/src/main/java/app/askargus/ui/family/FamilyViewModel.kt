package app.askargus.ui.family

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.askargus.net.ApiException
import app.askargus.net.ArgusApi
import app.askargus.net.FamilyMember
import app.askargus.net.InviteResponse
import app.askargus.net.SignedOutException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class FamilyViewModel(private val api: ArgusApi) : ViewModel() {
    data class UiState(
        val loading: Boolean = true,
        val members: List<FamilyMember> = emptyList(),
        val error: String? = null,
        val busy: Boolean = false,
        val signedOut: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            _state.value = try {
                UiState(loading = false, members = api.family().members)
            } catch (e: SignedOutException) {
                UiState(loading = false, signedOut = true)
            } catch (e: ApiException) {
                UiState(loading = false, error = e.message)
            }
        }
    }

    suspend fun invite(): InviteResponse? {
        _state.update { it.copy(busy = true, error = null) }
        return try {
            api.familyInvite()
        } catch (e: SignedOutException) {
            _state.update { it.copy(signedOut = true) }
            null
        } catch (e: ApiException) {
            _state.update { it.copy(error = e.message) }
            null
        } finally {
            _state.update { it.copy(busy = false) }
        }
    }

    fun leave(linkId: String) {
        viewModelScope.launch {
            try {
                api.leaveFamily(linkId)
                load()
            } catch (e: SignedOutException) {
                _state.update { it.copy(signedOut = true) }
            } catch (e: ApiException) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }
}

class JoinViewModel(private val api: ArgusApi, private val code: String) : ViewModel() {
    sealed interface UiState {
        data object Loading : UiState
        data class Invite(val name: String?, val busy: Boolean = false, val error: String? = null) : UiState
        data object Dead : UiState
        data class Joined(val name: String) : UiState
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            _state.value = try {
                api.inviteInfo(code).let { if (it.valid) UiState.Invite(it.name) else UiState.Dead }
            } catch (e: ApiException) {
                UiState.Invite(null, error = e.message)
            }
        }
    }

    fun join() {
        val current = _state.value as? UiState.Invite ?: return
        _state.value = current.copy(busy = true, error = null)
        viewModelScope.launch {
            _state.value = try {
                UiState.Joined(api.familyJoin(code).name)
            } catch (e: SignedOutException) {
                current.copy(busy = false, error = "Sign in first, then tap Join.")
            } catch (e: ApiException) {
                current.copy(busy = false, error = e.message)
            }
        }
    }
}
