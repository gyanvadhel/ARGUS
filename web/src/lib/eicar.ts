// The EICAR antivirus test string, stored reversed so antivirus software doesn't quarantine
// this file or the built bundle. It is harmless by design: every antivirus flags it on purpose.
const REVERSED = "*H+H$!ELIF-TSET-SURIVITNA-DRADNATS-RACIE$}7)CC7)^P(45XZP\\4[PA@%P!O5X";

export function eicarText(): string {
  return REVERSED.split("").reverse().join("");
}

export function eicarFile(): File {
  return new File([eicarText()], "eicar-test-file.com", { type: "application/octet-stream" });
}
