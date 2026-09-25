# ARGUS ML Trainer (Android / Java)

A small Android Studio project that trains a real text-classification ML model
**from scratch, on-device, in plain Java** — no TensorFlow Lite, no external ML
library, no server. It's a companion demo to the ARGUS desktop prototype,
showing the same idea (a keyword/text classifier that scores messages as
Safe vs. Threat) as a native Android app you can build and run.

## What it does

1. Tap **Train Model** — the app builds a bag-of-words vocabulary from 36
   labeled example messages (18 Safe, 18 Threat), then trains a **logistic
   regression** classifier using **batch gradient descent**, right on the
   device. You'll see the training loss drop epoch-by-epoch in a live log.
2. Type any message into the text box and tap **Classify** — the trained
   model scores it 0–100 and labels it SAFE / LOW-MODERATE / SUSPICIOUS /
   HIGH RISK, the same bands used by the ARGUS desktop app.

This is genuinely training a model, not faking it: the weights start at
zero and are updated every epoch by real gradient descent on the training
loss (binary cross-entropy). The training loop and math were verified
against an equivalent Python implementation before being ported to Java.

## Project structure

```
ArgusMLTrainer/
├── build.gradle                  # root Gradle config
├── settings.gradle
├── gradle.properties
├── gradle/wrapper/gradle-wrapper.properties
└── app/
    ├── build.gradle               # module config (compileSdk 34, minSdk 24)
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/argus/mltrainer/
        │   ├── TextClassifier.java   # the ML model: vectorizer + logistic regression + training loop
        │   ├── TrainingData.java     # the 36-example labeled dataset
        │   └── MainActivity.java     # UI wiring: train button, live log, classify button
        └── res/
            ├── layout/activity_main.xml
            └── values/ (strings.xml, colors.xml, themes.xml)
```

## How the ML actually works (`TextClassifier.java`)

- **Tokenize** — lowercases text and splits it into words with a regex.
- **Vectorize** — builds a bag-of-words vocabulary from the training set,
  then represents each message as a vector of word counts.
- **Train** — logistic regression trained with batch gradient descent:
  - `prediction = sigmoid(bias + Σ weight[i] × feature[i])`
  - loss = binary cross-entropy between prediction and true label
  - after each epoch, every weight is nudged in the direction that reduces
    the loss: `weight[i] -= learningRate × gradient[i] / sampleCount`
  - runs for 300 epochs by default (configurable in `MainActivity.EPOCHS`)
- **Predict** — runs the same vectorize → weighted sum → sigmoid pipeline on
  new text and returns a probability between 0.0 (safe) and 1.0 (high risk).

Training runs on a background `Thread` so the UI stays responsive, with
progress posted back to the main thread via `runOnUiThread()`.

## Opening the project in Android Studio

1. Open Android Studio → **File → Open...** → select the `ArgusMLTrainer`
   folder (the one containing `settings.gradle`).
2. Android Studio will detect it's missing a Gradle wrapper jar and offer to
   generate one automatically — accept that, or go to
   **File → Sync Project with Gradle Files** if it doesn't prompt you.
   This requires an internet connection so Gradle can download the Android
   Gradle Plugin and AndroidX libraries the first time.
3. Once sync finishes, click the green **Run ▶** button with an emulator or
   a physical device connected/selected.

**Requirements:** Android Studio (Iguana 2023.2.1 or newer recommended),
which bundles a compatible JDK. Minimum device/emulator: Android 7.0
(API 24) or newer.

## Why this design

- **No external ML dependencies** — everything (vectorizer, model, training
  loop) is ~150 lines of plain Java in `TextClassifier.java`, so it's easy
  to read top-to-bottom and explain in a class presentation.
- **Real training, not a lookup table** — the weights are genuinely learned
  from the data via gradient descent; the training log shows the loss
  decreasing epoch by epoch, which is the actual signal that learning is
  happening.
- **Small, fixed dataset** — 36 examples keep training fast (well under a
  second on a real device) so the demo stays snappy, while still being
  enough for logistic regression to separate Safe from Threat messages
  clearly.

## Relationship to the ARGUS desktop prototype

The desktop Streamlit prototype uses a **TF-IDF + scikit-learn Logistic
Regression** classifier (5 classes: Safe/Spam/Phishing/Fraud/Social-
Engineering) combined with keyword rules and a threat-intel lookup. This
Android app implements the same core idea — bag-of-words features into a
logistic regression classifier — simplified to a **binary classifier**
(Safe vs. Threat) with **hand-written training code** instead of
scikit-learn, since the goal here is to show the training process itself
running natively on a phone.
