import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Capacitor loads the exported site from the Android app's local WebView.
  // Keep the app client-side; data and authentication are handled by Supabase.
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
