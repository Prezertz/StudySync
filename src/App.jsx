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
  const [createdRooms, setCreatedRooms] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();

  // Check auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Track created rooms and persist in localStorage
  const addCreatedRoom = (roomId) => {
    const rooms = [...createdRooms, roomId];
    setCreatedRooms(rooms);
    localStorage.setItem('createdRooms', JSON.stringify(rooms));
  };

  // Load persisted rooms on mount
  useEffect(() => {
    const savedRooms = localStorage.getItem('createdRooms');
    if (savedRooms) {
      setCreatedRooms(JSON.parse(savedRooms));
    }
  }, []);

  // Handle route protection
  useEffect(() => {
    if (loading) return;

    const authRoutes = ["/", "/username"];
    const isAuthRoute = authRoutes.includes(location.pathname);
    const isRoomRoute = location.pathname.startsWith("/room/");
    const roomId = location.pathname.split("/room/")[1];

    // Redirect from auth routes if logged in
    if (session && isAuthRoute) {
      navigate("/dashboard", { replace: true });
      window.history.pushState(null, "", "/dashboard");
    }

    // Handle back button from created rooms
    if (session && isRoomRoute && createdRooms.includes(roomId)) {
      const handleBackButton = () => {
        navigate("/dashboard", { replace: true });
      };
      
      window.addEventListener('popstate', handleBackButton);
      return () => window.removeEventListener('popstate', handleBackButton);
    }
  }, [session, loading, location, createdRooms]);

  if (loading) return <div className="page-center">Loading...</div>;

  return (
    <Routes>
      <Route path="/" element={<Auth />} />
      <Route path="/username" element={<Username />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route 
        path="/create-room" 
        element={<CreateRoom onRoomCreated={addCreatedRoom} />} 
      />
      <Route path="/room/:id" element={<Room />} />
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