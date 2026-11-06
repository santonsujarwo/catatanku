# CatatKu Android foundation

CatatKu keeps one Next.js codebase and one Supabase backend. The Android app is a Capacitor shell that loads the statically exported Next.js client. Authentication and transaction data continue to use Supabase; do not create a second database for Android.

## Requirements
- Node.js 20.9+
- Android Studio with Android SDK installed
- Java version required by the installed Android Gradle Plugin

## Build the web bundle

```bash
npm install
npm run build
```

Next.js exports the client app into `out/`. The app currently uses client-side Supabase Auth and browser Supabase queries, which are compatible with this static-export approach. Do not add Next.js server actions, API routes, middleware-dependent pages, or server-only rendering without revisiting the mobile architecture.

## Generate the native Android project (first time only)

```bash
npx cap add android
npm run cap:sync
npm run cap:open:android
```

Build and run the app from Android Studio on an emulator or connected device. The generated `android/` project is intentionally not included yet; generate it with the command above so the local Android SDK and Gradle setup can be validated first.

## Update after web changes

```bash
npm run android:build
npm run cap:open:android
```

## Supabase setup

- Keep the Supabase project URL and publishable key in the public client configuration (or the matching `NEXT_PUBLIC_*` environment variables).
- Never put a Supabase service-role key in the Android app or browser bundle.
- Keep Row Level Security enabled. The policies in `supabase/schema.sql` must scope transaction rows to `auth.uid()`.
- In Supabase Authentication → URL Configuration, allow the production web URL and any redirect URLs used by authentication. If password reset or OAuth is added to the native app, configure and test a dedicated Capacitor deep-link callback before enabling it.

## Session behavior

Supabase JS persists the session in browser storage by default. In Capacitor's Android WebView this storage is local to the app installation. Users stay signed in between normal app launches, but clearing app data or uninstalling the app removes the local session. Users can sign in again and their cloud transactions remain in Supabase.

## Current scope and limitations

This is the Android-ready foundation, not a signed APK/AAB release. Before publishing, validate login/signup, email confirmation, transaction CRUD, offline/network failure states, keyboard behavior, back navigation, app icon, splash screen, privacy policy, and Play Store requirements on a real Android device.
