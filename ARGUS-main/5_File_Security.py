from utils.module_page import run_module_page

run_module_page(
    title="File Security",
    icon="📁",
    module_name="file",
    description="Upload a file (or paste its contents) to flag risky filename/content signals. Text-based analysis only in this demo — not real malware scanning.",
    input_label="File contents (paste as text)",
    placeholder="Paste file contents here, or use the Upload file tab.",
    allow_file_upload=True,
    file_types=["txt", "csv", "log", "json", "md"],
)
