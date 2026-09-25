from utils.module_page import run_module_page

run_module_page(
    title="Email Security",
    icon="✉️",
    module_name="email",
    description="Paste or upload email content to scan for phishing and business-email-compromise patterns.",
    input_label="Email content (subject + body)",
    placeholder="e.g. \"Subject: Account Verification Required\\n\\nDear customer, click here to verify your bank account...\"",
    allow_file_upload=True,
    file_types=["txt", "eml"],
)
