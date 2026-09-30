package app.askargus.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.askargus.AppContainer
import app.askargus.BuildConfig
import app.askargus.LocalHost
import app.askargus.ui.auth.SignInViewModel.Mode
import app.askargus.ui.components.ArgusButton
import app.askargus.ui.components.ArgusOutlinedButton
import app.askargus.ui.components.EyeMood
import app.askargus.ui.components.LivingEye
import app.askargus.ui.theme.ArgusColors
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(container: AppContainer, back: Boolean, onDone: () -> Unit, onSkip: () -> Unit) {
    val vm: SignInViewModel = viewModel { SignInViewModel(container.account) }
    val state by vm.state.collectAsState()
    val host = LocalHost.current
    val scope = rememberCoroutineScope()
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    val creating = state.mode == Mode.CREATE

    LaunchedEffect(state.done) { if (state.done) onDone() }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        LivingEye(if (state.busy) EyeMood.SCANNING else EyeMood.WATCHING, Modifier.fillMaxWidth(0.4f).align(Alignment.CenterHorizontally))
        Text(if (creating) "Create your account" else "Sign in to Argus", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Checks use Argus's servers, so they need a free account. It's the same account as on askargus.app.",
            style = MaterialTheme.typography.bodyMedium,
            color = ArgusColors.MutedText,
        )
        if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()) {
            ArgusOutlinedButton(
                "Continue with Google",
                onClick = {
                    scope.launch {
                        runCatching { host.googleSignIn() }
                            .onSuccess { vm.google(it.idToken, it.rawNonce) }
                            .onFailure { vm.googleFailed(GoogleSignIn.friendly(it)) }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.busy,
            )
            Text("or with email", style = MaterialTheme.typography.labelMedium, color = ArgusColors.MutedText, modifier = Modifier.align(Alignment.CenterHorizontally))
        }
        if (creating) {
            OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        OutlinedTextField(
            email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        OutlinedTextField(
            password, { password = it }, label = { Text("Password") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        )
        state.error?.let { Text(it, color = ArgusColors.High, style = MaterialTheme.typography.bodyMedium) }
        state.notice?.let { Text(it, color = ArgusColors.Safe, style = MaterialTheme.typography.bodyMedium) }
        ArgusButton(
            if (creating) "Create account" else "Sign in",
            onClick = { vm.submit(name, email, password) },
            modifier = Modifier.fillMaxWidth(),
            busy = state.busy,
        )
        TextButton(onClick = { vm.setMode(if (creating) Mode.SIGN_IN else Mode.CREATE) }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(if (creating) "I already have an account" else "New to Argus? Create an account", color = ArgusColors.Foreground)
        }
        TextButton(onClick = onSkip, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(if (back) "Not now" else "Skip for now", color = ArgusColors.MutedText)
        }
    }
}
