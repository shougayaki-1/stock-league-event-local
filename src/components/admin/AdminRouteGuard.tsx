import { useState, useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { getAdminRole, type AdminRole } from "../../services/admin";

interface AdminRouteGuardProps {
  allowedRoles?: Exclude<AdminRole, "none">[];
}

export default function AdminRouteGuard({ allowedRoles = ["general", "core"] }: AdminRouteGuardProps) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AdminRole>("none");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        setRole(await getAdminRole(user));
      } catch (e) {
        console.error("Error checking admin status:", e);
        setRole("none");
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-950 flex flex-col items-center justify-center text-blue-500 font-black tracking-widest uppercase">
        <span className="animate-spin mr-3 border-4 border-current border-t-transparent rounded-full w-8 h-8 mb-4 text-blue-500" />
        Checking Credentials
      </div>
    );
  }

  if (role === "none") {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/terminal" replace />;
  }

  return <Outlet />;
}
