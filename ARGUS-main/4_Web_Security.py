from utils.module_page import run_module_page

run_module_page(
    title="Web Security",
    icon="🌐",
    module_name="web",
    description="Paste a URL or page content to check it against rules and the local threat-intelligence list.",
    input_label="URL or page content",
    placeholder="e.g. \"http://verify-account-secure.com/login\" or paste the page's visible text",
)
