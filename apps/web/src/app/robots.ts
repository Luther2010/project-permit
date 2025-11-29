import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "https://permitpulse.us";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/features", "/pricing", "/cities/"],
        disallow: ["/api/", "/pricing/success", "/pricing/cancel"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

