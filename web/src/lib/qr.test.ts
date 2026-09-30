import { describe, expect, it } from "vitest";
import { parseQr } from "./qr";

describe("parseQr", () => {
  it("reads a UPI payment code: who it pays, how much, and the note", () => {
    expect(parseQr("upi://pay?pa=refund.desk@ybl&pn=KBC%20Prize%20Team&am=4999.00&cu=INR&tn=Claim%20your%20prize")).toEqual({
      kind: "upi",
      mandate: false,
      payee: "refund.desk@ybl",
      name: "KBC Prize Team",
      amount: "4999.00",
      note: "Claim your prize",
    });
  });

  it("spots autopay mandates, which set up repeated payments", () => {
    const p = parseQr("UPI://MANDATE?pa=shop@okaxis&pn=Shop&am=999");
    expect(p).toMatchObject({ kind: "upi", mandate: true, payee: "shop@okaxis", amount: "999" });
  });

  it("leaves out what a UPI code doesn't say", () => {
    expect(parseQr("upi://pay?pa=chai.stall@paytm")).toMatchObject({ name: null, amount: null, note: null });
  });

  it("treats a UPI code with no payee as plain text", () => {
    expect(parseQr("upi://pay?pn=Nobody")).toEqual({ kind: "text", text: "upi://pay?pn=Nobody" });
  });

  it("sends links to a link check", () => {
    expect(parseQr("https://paytm-kyc-update.example/login")).toEqual({ kind: "url", url: "https://paytm-kyc-update.example/login" });
    expect(parseQr("  www.example.com/offer ")).toEqual({ kind: "url", url: "https://www.example.com/offer" });
  });

  it("sends phone numbers to Caller ID and texts to a text check", () => {
    expect(parseQr("tel:+919876543210")).toEqual({ kind: "phone", number: "+919876543210" });
    expect(parseQr("SMSTO:+919876543210:Your KYC expires today, call now")).toEqual({
      kind: "text",
      text: "Your KYC expires today, call now\n+919876543210",
    });
    expect(parseQr("Table 4, ask for the menu")).toEqual({ kind: "text", text: "Table 4, ask for the menu" });
  });
});
