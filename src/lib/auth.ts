import { auth, currentUser } from "@clerk/nextjs/server";

export type UserRole = "tenant" | "landlord" | null;

export async function getUserRole(): Promise<UserRole> {
  const { sessionClaims } = await auth();
  
  // If role is set in public metadata, it's available in sessionClaims or we can fetch currentUser
  const user = await currentUser();
  if (!user) return null;
  
  const role = user.publicMetadata?.role as UserRole;
  return role || null;
}
