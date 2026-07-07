import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Usuario } from '../types';

interface AuthState {
  user: Usuario | null;
  token: string | null;
  setCredentials: (payload: { user: Usuario; token: string }) => void;
  setToken: (token: string) => void;
  setUser: (user: Usuario) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setCredentials: ({ user, token }) => set({ user, token }),
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      logout: () => {
        set({ user: null, token: null });
        localStorage.removeItem('erp-auth');
      },
    }),
    {
      name: 'erp-auth',
    },
  ),
);
