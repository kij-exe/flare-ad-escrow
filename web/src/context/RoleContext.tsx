"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Role = "client" | "creator";

interface RoleContextValue {
    role: Role;
    setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

const STORAGE_KEY = "trusttube-role";

export function RoleProvider({ children }: { children: ReactNode }) {
    const [role, setRoleState] = useState<Role>("client");

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === "client" || stored === "creator") {
            setRoleState(stored);
        }
    }, []);

    const setRole = (newRole: Role) => {
        setRoleState(newRole);
        localStorage.setItem(STORAGE_KEY, newRole);
    };

    return (
        <RoleContext.Provider value={{ role, setRole }}>
            {children}
        </RoleContext.Provider>
    );
}

export function useRole() {
    const context = useContext(RoleContext);
    if (!context) {
        throw new Error("useRole must be used within a RoleProvider");
    }
    return context;
}
