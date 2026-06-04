"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, User } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { ARC_STABLECOINS } from "@/lib/arc";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 MB

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [stablecoin, setStablecoin] = useState(profile.preferred_stablecoin);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSaved(false);

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image is too large — keep it under 3 MB.");
      return;
    }

    setUploading(true);
    // Namespace by user id so storage RLS allows the write; a timestamped name
    // busts the CDN cache so the new photo shows immediately.
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${profile.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", profile.id);

    setUploading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setAvatarUrl(publicUrl);
    setSaved(true);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        preferred_stablecoin: stablecoin,
      })
      .eq("id", profile.id);
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Profile photo */}
      <div className="flex items-center gap-4">
        <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary/60">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Profile photo"
              className="h-full w-full object-cover"
            />
          ) : (
            <User className="h-8 w-8 text-muted-foreground" />
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </span>
          )}
        </span>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Profile photo</p>
          <p className="text-xs text-muted-foreground">
            PNG or JPG, up to 3 MB.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            {avatarUrl ? "Change photo" : "Upload photo"}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="fullName" className="text-sm font-medium">
          Full name
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={profile.email ?? ""}
          disabled
          className="h-11 w-full rounded-xl border border-input bg-muted px-4 text-sm text-muted-foreground"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="stablecoin" className="text-sm font-medium">
          Preferred stablecoin
        </label>
        <select
          id="stablecoin"
          value={stablecoin}
          onChange={(e) =>
            setStablecoin(e.target.value as Profile["preferred_stablecoin"])
          }
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {ARC_STABLECOINS.map((coin) => (
            <option key={coin} value={coin}>
              {coin}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-primary">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
