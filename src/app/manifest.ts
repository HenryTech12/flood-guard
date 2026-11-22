import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FloodGuard Volunteer",
    short_name: "FloodGuard",
    description: "Accept and complete flood rescue jobs.",
    start_url: "/volunteer",
    scope: "/volunteer",
    display: "standalone",
    background_color: "#0a2452",
    theme_color: "#0a2452",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
