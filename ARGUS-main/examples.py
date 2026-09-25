"""
Curated example messages for each module, so the demo has one-click test data
instead of requiring the user to type/paste content by hand. These are the same
kinds of examples documented in the README / walkthrough, verified against the
Risk Engine to land in their labeled band (SAFE / SUSPICIOUS / HIGH RISK).
"""

EXAMPLES = {
    "call": [
        {
            "label": "✅ Safe — friend checking in",
            "text": "Hey, it's just me calling to see if you're free for lunch this Saturday. Give me a call back whenever.",
        },
        {
            "label": "⚠️ Suspicious — fake tech support",
            "text": "This is Microsoft technical support. We detected a virus on your computer. Give us remote access to your computer immediately to fix this urgent issue, and do not tell anyone.",
        },
        {
            "label": "🚫 High Risk — bank fraud scam",
            "text": "Hi, this is your bank fraud department calling from 1-800-555-0142. We noticed suspicious activity and unusual activity. I need you to confirm your pin, confirm your card number, and verify your password immediately, and stay on the line. Please do not tell your family, do not tell anyone, keep this confidential.",
        },
    ],
    "sms": [
        {
            "label": "✅ Safe — delivery notice",
            "text": "Your Amazon order #4471 has shipped and will arrive Friday.",
        },
        {
            "label": "⚠️ Suspicious — prize spam",
            "text": "Congratulations you won a $1000 gift card, claim your prize today by clicking this link, limited time offer!",
        },
        {
            "label": "🚫 High Risk — account suspension phishing",
            "text": "URGENT: Your account has been suspended. Verify your identity immediately and enter your otp code here: http://verify-account-secure.com/login",
        },
    ],
    "email": [
        {
            "label": "✅ Safe — meeting reminder",
            "text": "Subject: Team Meeting Tomorrow\n\nHi team, just a reminder that our meeting is moved to 2pm, same room as always. See you there!",
        },
        {
            "label": "⚠️ Suspicious — billing update request",
            "text": "Subject: Payment Issue\n\nWe could not process your payment, please update your card details at this link now to avoid interruption to your service.",
        },
        {
            "label": "🚫 High Risk — PayPal phishing",
            "text": "Subject: Immediate Action Required\n\nDear customer, we detected unusual activity. Verify your identity and verify your password immediately at support@paypa1-security.com or your account will be suspended within 24 hours. Click here now.",
        },
    ],
    "web": [
        {
            "label": "✅ Safe — normal article text",
            "text": "Welcome to our blog! Today we're covering five tips for a healthier morning routine, starting with hydration.",
        },
        {
            "label": "⚠️ Suspicious — shortened link lure",
            "text": "Check out this amazing deal, click here now: bit.ly/free-prize-claim, limited time offer, act now before it's gone!",
        },
        {
            "label": "🚫 High Risk — known phishing domain",
            "text": "http://verify-account-secure.com/login - Please verify your account, verify your password, and enter your otp code immediately to avoid suspension, act now, click here, urgent.",
        },
    ],
    "file": [
        {
            "label": "✅ Safe — meeting notes",
            "text": "Meeting Notes - Aug 10\n\nDiscussed Q3 roadmap, agreed on next steps, follow up next week.",
        },
        {
            "label": "⚠️ Suspicious — macro-enabled invoice lure",
            "text": "invoice_urgent.docm\n\nPlease enable macros to view this invoice. Payment overdue, click here to view attached document immediately.",
        },
        {
            "label": "🚫 High Risk — credential harvesting script content",
            "text": "account_verify.txt\n\nURGENT: verify your password and confirm your card number and pin immediately, enter your otp code, or your account will be suspended, do not tell anyone, keep this confidential.",
        },
    ],
}

CALLER_EXAMPLES = [
    {
        "label": "✅ Safe — wrong number",
        "text": "Hi sorry, I think I have the wrong number, I was trying to reach a plumber.",
    },
    {
        "label": "⚠️ Suspicious — vague urgency",
        "text": "This is urgent, I need you to confirm your identity right now or there will be a problem with your account.",
    },
    {
        "label": "🚫 High Risk — bank PIN request",
        "text": "This is your bank's fraud department calling from 1-800-555-0142, we noticed suspicious activity, please confirm your pin and card number immediately, do not tell your family, keep this confidential.",
    },
]
