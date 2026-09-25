from utils.module_page import run_module_page

run_module_page(
    title="SMS Security",
    icon="💬",
    module_name="sms",
    description="Paste an SMS/text message to score it for phishing, spam, and fraud indicators.",
    input_label="SMS message text",
    placeholder="e.g. \"URGENT: Your account has been suspended, verify your identity now: bit.ly/xyz\"",
)
