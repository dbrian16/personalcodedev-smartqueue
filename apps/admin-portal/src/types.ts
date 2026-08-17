/** Who is signed in. Comes from the login response and is kept in sessionStorage. */
export interface UserMeta {
  displayName?: string;
  service?: string;
}

export type UserRole = 'admin' | 'staff';
