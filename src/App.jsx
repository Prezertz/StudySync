import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import Auth from "./Auth";
import Username from "./Username";
import Dashboard from "./Dashboard";
import CreateRoom from "./CreateRoom";
import Room from "./Room";

const AuthWrapper = () => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState(false);
  const [createdRooms, setCreatedRooms] = useState([]);
  const [deletedRooms, setDeletedRooms] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();

  // Fetch session and profile completeness on mount
  useEffect(() => {
    const fetchSessionAndProfile = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);

      if (session?.user?.id) {
        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", session.user.id)
          .single();

        setProfileComplete(!error && !!profiles?.username);
      } else {
        setProfileComplete(false);
      }

      setLoading(false);
    };

    fetchSessionAndProfile();

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);

      if (session?.user?.id) {
        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", session.user.id)
          .single();

        setProfileComplete(!error && !!profiles?.username);
      } else {
        setProfileComplete(false);
      }

      // Redirect to login if logged out
      if (!session) {
        navigate("/", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Track created and deleted rooms
  const addCreatedRoom = (roomId) => {
    const rooms = [...createdRooms, roomId];
    setCreatedRooms(rooms);
    localStorage.setItem("createdRooms", JSON.stringify(rooms));
    removeDeletedRoom(roomId);
  };

  const addDeletedRoom = (roomId) => {
    const rooms = [...deletedRooms, roomId];
    setDeletedRooms(rooms);
    localStorage.setItem("deletedRooms", JSON.stringify(rooms));
    setCreatedRooms((prev) => prev.filter((id) => id !== roomId));
    localStorage.setItem(
      "createdRooms",
      JSON.stringify(createdRooms.filter((id) => id !== roomId))
    );
  };

  const removeDeletedRoom = (roomId) => {
    setDeletedRooms((prev) => prev.filter((id) => id !== roomId));
    localStorage.setItem(
      "deletedRooms",
      JSON.stringify(deletedRooms.filter((id) => id !== roomId))
    );
  };

  // Load from localStorage on mount
  useEffect(() => {
    const savedCreatedRooms = localStorage.getItem("createdRooms");
    const savedDeletedRooms = localStorage.getItem("deletedRooms");
    if (savedCreatedRooms) setCreatedRooms(JSON.parse(savedCreatedRooms));
    if (savedDeletedRooms) setDeletedRooms(JSON.parse(savedDeletedRooms));
  }, []);

  // Route protection and redirect logic
  useEffect(() => {
    if (loading) return;

    const pathname = location.pathname;
    const isAuthPage = pathname === "/" || pathname === "/username";
    const isProtectedPage = ["/dashboard", "/create-room"].some((route) =>
      pathname.startsWith(route)
    );
    const isRoomPage = pathname.startsWith("/room/");
    const roomId = pathname.split("/room/")[1];

    // 🔒 Redirect logged-in users away from auth pages
    if (session && profileComplete && isAuthPage) {
      navigate("/dashboard", { replace: true });
      return;
    }

    // ✅ Allow /username if logged in but profile not complete
    if (session && pathname === "/username" && !profileComplete) return;

    // 🔒 Prevent access to protected pages when logged out
    if (!session && (isProtectedPage || isRoomPage)) {
      navigate("/", { replace: true });
      return;
    }

    // 👈 Handle browser back from room after deletion/logout
    if (
      (session && isRoomPage && (createdRooms.includes(roomId) || deletedRooms.includes(roomId))) ||
      (!session && (isProtectedPage || isRoomPage))
    ) {
      const handleBackButton = () => {
        navigate(session ? "/dashboard" : "/", { replace: true });
      };

      window.addEventListener("popstate", handleBackButton);
      return () => window.removeEventListener("popstate", handleBackButton);
    }
  }, [session, loading, location, profileComplete, createdRooms, deletedRooms]);

  if (loading) return <div className="page-center">Loading...</div>;

  return (
    <Routes>
      <Route path="/" element={<Auth />} />
      <Route path="/username" element={<Username />} />
      <Route
        path="/dashboard"
        element={<Dashboard onRoomDeleted={addDeletedRoom} />}
      />
      <Route
        path="/create-room"
        element={<CreateRoom onRoomCreated={addCreatedRoom} />}
      />
      <Route
        path="/room/:id"
        element={<Room onRoomDeleted={addDeletedRoom} />}
      />
    </Routes>
  );
};

const App = () => (
  <Router>
    <AuthWrapper />
  </Router>
);

export default App;
