import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FloodGuard Volunteer",
    short_name: "FloodGuard",
    description: "Accept and complete flood rescue jobs.",
    start_url: "/volunteer",
    scope: "/volunteer",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b4ea2",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
