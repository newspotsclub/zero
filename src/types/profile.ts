export type ListVisibility = "public" | "private";

export type Profile = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role?: string | null;
};

export type ProfileList = {
  id: string;
  user_id: string;
  title: string;
  visibility: ListVisibility;
  slug: string;
  created_at: string;
  updated_at: string;
};

export type ProfileListItem = {
  id: number;
  list_id: string;
  spot_id: number;
  created_at: string;
};
