# Where Argus's training data comes from

## Scam-text model (`argus_api/ml/scam_text.py`)

- **`sms_spam_collection.tsv`**: the SMS Spam Collection v.1, 5,574 real text messages (747 spam),
  unchanged. Copyright Tiago A. Almeida and José María Gómez Hidalgo, provided free of charge, as is,
  without warranty. Source: https://archive.ics.uci.edu/dataset/228/sms+spam+collection and
  http://www.dt.fee.unicamp.br/~tiago/smsspamcollection/
  Reference: Almeida, T.A., Gómez Hidalgo, J.M., Yamakami, A. *Contributions to the Study of SMS Spam
  Filtering: New Collection and Results.* ACM DocEng 2011.
- **`training_data.csv`**: 65 hand-written examples from the original Argus prototype (25 ordinary;
  spam, phishing, fraud and social engineering 10 each).
- **`indian_sms_examples.csv`**: hand-written for Argus: everyday Indian messages (bank alerts, OTPs,
  deliveries, bookings, chats) and common Indian scams (KYC, power cut-off, fake jobs, parcels, lotteries).
  They exist because the SMS collection is from the UK and Singapore, and without them the model mistook
  ordinary Indian bank alerts for spam. They are few, so the accuracy figures mostly reflect the collection.

## Phishing-link model (`argus_api/ml/phish_link.py`, weights in `link_model.npz`)

Trained by `scripts/train_link_model.py` from the threat feeds the engine downloads. Only the learned
weights ship, not the lists. `link_model.json` records the date, sizes and held-out scores.

- Phishing domains: Phishing.Database (https://github.com/mitchellkrogza/Phishing.Database) and the
  OpenPhish community feed (https://openphish.com).
- Legitimate domains: the Tranco list of the most visited sites (https://tranco-list.eu).

## Not training data

- **`threat_intel.csv`**: the prototype's small built-in demo list of known-bad domains, numbers and
  addresses (fictional 555 numbers included). The text and link checkers look things up in it directly.
