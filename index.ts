import express from "express";
import cors from "cors";
import { z } from "zod";
import crypto from "node:crypto";

const app = express();
const port = Number(process.env.PORT || 8787);
app.use(cors({ origin: process.env.APP_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "sonora-api", integrations: {
  spotify: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
  soundcloud: Boolean(process.env.SOUNDCLOUD_CLIENT_ID && process.env.SOUNDCLOUD_CLIENT_SECRET)
}}));

/**
 * Integration status only. Do not report OAuth as connected until a provider-specific
 * authorization-code flow, state validation, token storage, and API checks are implemented.
 * Never expose client secrets through VITE_* variables.
 */
app.get("/api/integrations", (_req, res) => res.json({
  spotify: { configured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET), status: "setup-required" },
  soundcloud: { configured: Boolean(process.env.SOUNDCLOUD_CLIENT_ID && process.env.SOUNDCLOUD_CLIENT_SECRET), status: "setup-required" }
}));

const exportSchema = z.object({
  playlists: z.array(z.object({
    name: z.string().min(1).max(200),
    tracks: z.array(z.object({ title: z.string().max(500), artist: z.string().max(500).optional() })).max(10000)
  })).max(500)
});
app.post("/api/validate-playlist-export", (req, res) => {
  const parsed = exportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid playlist export", details: parsed.error.flatten() });
  return res.json({ valid: true, playlistCount: parsed.data.playlists.length });
});

app.get("/api/oauth/:provider/start", (req, res) => {
  const provider = req.params.provider;
  if (provider !== "spotify" && provider !== "soundcloud") return res.status(404).json({ error: "Unknown provider" });
  const configured = provider === "spotify"
    ? Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REDIRECT_URI)
    : Boolean(process.env.SOUNDCLOUD_CLIENT_ID && process.env.SOUNDCLOUD_CLIENT_SECRET && process.env.SOUNDCLOUD_REDIRECT_URI);
  if (!configured) return res.status(503).json({ error: `${provider} OAuth is not configured. See .env.example and README.` });
  // Deliberately stop here: provider-specific OAuth URLs/scopes change and must be
  // implemented against the provider's current official documentation before use.
  const state = crypto.randomBytes(24).toString("hex");
  return res.status(501).json({ error: "OAuth flow not implemented yet", provider, stateGenerated: Boolean(state), message: "Configure the current official OAuth flow and state/session storage before enabling this endpoint." });
});

app.listen(port, () => console.log(`SONORA API listening on http://localhost:${port}`));