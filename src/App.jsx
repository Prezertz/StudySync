import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from "react-router-dom";
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
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      if (session?.user?.id) {
        // Fetch profile to check if username is set
        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", session.user.id)
          .single();

        if (!error && profiles?.username) {
          setProfileComplete(true);
        } else {
          setProfileComplete(false);
        }
      } else {
        setProfileComplete(false);
      }

      setLoading(false);
    };

    fetchSessionAndProfile();

    // Subscribe to auth state changes to update session and profile completeness
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);

      if (session?.user?.id) {
        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", session.user.id)
          .single();

        if (!error && profiles?.username) {
          setProfileComplete(true);
        } else {
          setProfileComplete(false);
        }
      } else {
        setProfileComplete(false);
      }

      // Clear history and redirect to login on logout
      if (!session && location.pathname !== "/") {
        navigate("/", { replace: true });
        window.history.pushState(null, "", "/");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Track created rooms and persist in localStorage
  const addCreatedRoom = (roomId) => {
    const rooms = [...createdRooms, roomId];
    setCreatedRooms(rooms);
    localStorage.setItem('createdRooms', JSON.stringify(rooms));
    removeDeletedRoom(roomId);
  };

  // Track deleted rooms
  const addDeletedRoom = (roomId) => {
    const rooms = [...deletedRooms, roomId];
    setDeletedRooms(rooms);
    localStorage.setItem('deletedRooms', JSON.stringify(rooms));
    setCreatedRooms(prev => prev.filter(id => id !== roomId));
    localStorage.setItem('createdRooms', 
      JSON.stringify(createdRooms.filter(id => id !== roomId)));
  };

  const removeDeletedRoom = (roomId) => {
    setDeletedRooms(prev => prev.filter(id => id !== roomId));
    localStorage.setItem('deletedRooms', 
      JSON.stringify(deletedRooms.filter(id => id !== roomId)));
  };

  // Load persisted rooms on mount
  useEffect(() => {
    const savedCreatedRooms = localStorage.getItem('createdRooms');
    const savedDeletedRooms = localStorage.getItem('deletedRooms');
    if (savedCreatedRooms) setCreatedRooms(JSON.parse(savedCreatedRooms));
    if (savedDeletedRooms) setDeletedRooms(JSON.parse(savedDeletedRooms));
  }, []);

  // Handle route protection and redirects
  useEffect(() => {
    if (loading) return;

    const authRoutes = ["/auth", "/username"];
    const protectedRoutes = ["/dashboard", "/create-room", "/room"];
    const isAuthRoute = authRoutes.includes(location.pathname);
    const isProtectedRoute = protectedRoutes.some(route => location.pathname.startsWith(route));
    const isRoomRoute = location.pathname.startsWith("/room/");
    const roomId = location.pathname.split("/room/")[1];

    // Redirect from auth routes if logged in AND profile is complete
    if (session && isAuthRoute && profileComplete) {
      navigate("/dashboard", { replace: true });
      window.history.pushState(null, "", "/dashboard");
      return;
    }

    // Allow access to /username if logged in but profile incomplete
    if (session && location.pathname === "/username" && !profileComplete) {
      // Let user stay on /username until profile completed
      return;
    }

    // Redirect to login if accessing protected routes while logged out
    if (!session && isProtectedRoute) {
      navigate("/", { replace: true });
      window.history.pushState(null, "", "/");
      return;
    }

    // Handle back button from created/deleted rooms or after logout
    if ((session && isRoomRoute && (createdRooms.includes(roomId) || deletedRooms.includes(roomId))) || 
        (!session && isProtectedRoute)) {
      const handleBackButton = () => {
        navigate(session ? "/dashboard" : "/", { replace: true });
      };
      
      window.addEventListener('popstate', handleBackButton);
      return () => window.removeEventListener('popstate', handleBackButton);
    }
  }, [session, loading, location, createdRooms, deletedRooms, profileComplete]);

  if (loading) return <div className="page-center">Loading...</div>;

  return (
    <Routes>
      <Route path="/" element={<Auth />} />
      <Route path="/username" element={<Username />} />
      <Route path="/dashboard" element={
        <Dashboard onRoomDeleted={addDeletedRoom} />
      } />
      <Route 
        path="/create-room" 
        element={<CreateRoom onRoomCreated={addCreatedRoom} />} 
      />
      <Route path="/room/:id" element={
        <Room onRoomDeleted={addDeletedRoom} />
      } />
    </Routes>
  );
};

const App = () => {
  return (
    <Router>
      <AuthWrapper />
    </Router>
  );
};

export default App;
