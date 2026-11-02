export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fileName: string;
  mimeType: string;
  size: number;
  addedAt: number;
  favorite: boolean;
  audio: Blob;
};
export type Playlist = { id: string; name: string; trackIds: string[]; createdAt: number };
export type TrackMeta = Omit<Track, "audio">;
