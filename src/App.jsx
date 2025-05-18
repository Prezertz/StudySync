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
  const [deletedRooms, setDeletedRooms] = useState([]);
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
    // Remove from deleted rooms if recreating
    removeDeletedRoom(roomId);
  };

  // Track deleted rooms
  const addDeletedRoom = (roomId) => {
    const rooms = [...deletedRooms, roomId];
    setDeletedRooms(rooms);
    localStorage.setItem('deletedRooms', JSON.stringify(rooms));
    // Remove from created rooms
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

    // Handle back button from created or deleted rooms
    if (session && isRoomRoute && 
        (createdRooms.includes(roomId) || deletedRooms.includes(roomId))) {
      const handleBackButton = () => {
        navigate("/dashboard", { replace: true });
      };
      
      window.addEventListener('popstate', handleBackButton);
      return () => window.removeEventListener('popstate', handleBackButton);
    }
  }, [session, loading, location, createdRooms, deletedRooms]);

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