import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { FaUserAlt, FaTrash } from "react-icons/fa";
import "./Dashboard.css";

const Dashboard = ({ onRoomDeleted }) => {  // Added onRoomDeleted prop
  const [createdRooms, setCreatedRooms] = useState([]);
  const [joinedRooms, setJoinedRooms] = useState([]);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserRooms = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("Error fetching user:", userError);
        return;
      }

      setUserId(user.id);

      // Fetch user profile data
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Error fetching user profile:", profileError);
      } else {
        setUsername(userProfile.username);
      }

      await fetchRooms(user.id);
    };

    fetchUserRooms();
  }, []);

  const fetchRooms = async (userId) => {
    // Fetch created rooms
    const { data: userCreatedRooms, error: createdError } = await supabase
      .from("rooms")
      .select("*")
      .eq("created_by", userId);

    if (createdError) {
      console.error("Error fetching created rooms:", createdError);
    } else {
      setCreatedRooms(userCreatedRooms || []);
    }

    // Fetch joined rooms
    const { data: memberRecords, error: memberError } = await supabase
      .from("room_members")
      .select("room_id")
      .eq("user_id", userId);

    if (memberError) {
      console.error("Error fetching room memberships:", memberError);
      return;
    }

    const roomIds = memberRecords.map((r) => r.room_id);

    if (roomIds.length > 0) {
      const { data: roomsJoined, error: roomsError } = await supabase
        .from("rooms")
        .select("*")
        .in("id", roomIds)
        .neq("created_by", userId);

      if (roomsError) {
        console.error("Error fetching joined rooms:", roomsError);
      } else {
        setJoinedRooms(roomsJoined || []);
      }
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm("Are you sure you want to delete this room?")) return;

    try {
      // Delete room members first
      const { error: membersError } = await supabase
        .from("room_members")
        .delete()
        .eq("room_id", roomId);

      if (membersError) throw membersError;

      // Then delete the room
      const { error: roomError } = await supabase
        .from("rooms")
        .delete()
        .eq("id", roomId);

      if (roomError) throw roomError;

      // Update local state
      setCreatedRooms(prev => prev.filter(room => room.id !== roomId));
      setJoinedRooms(prev => prev.filter(room => room.id !== roomId));
      
      // Notify parent component about deleted room
      onRoomDeleted(roomId);
      
      alert("Room deleted successfully!");
    } catch (error) {
      console.error("Error deleting room:", error);
      alert("Failed to delete room");
    }
  };

  const handleJoinRoom = async () => {
    if (!joinRoomCode.trim()) return;

    const { data: room, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("join_code", joinRoomCode)
      .single();

    if (error || !room) {
      alert("Room not found!");
      return;
    }

    const { data: existing, error: existsError } = await supabase
      .from("room_members")
      .select("*")
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      alert("You are already a member of this room.");
      navigate(`/room/${room.id}`);
      return;
    }

    const { error: insertError } = await supabase
      .from("room_members")
      .insert([{ room_id: room.id, user_id: userId }]);

    if (insertError) {
      console.error("Error joining room:", insertError);
      return;
    }

    alert(`Joined room: ${room.name}`);
    await fetchRooms(userId); // Refresh the rooms list
    navigate(`/room/${room.id}`);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Logout failed:", error.message);
    } else {
      navigate("/");
    }
  };

  return (
 <div className="min-h-screen bg-gradient-to-br from-stone-50 to-amber-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
  <div className="max-w-6xl mx-auto space-y-8">
    
    {/* Header */}
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-sm overflow-hidden border border-stone-200/70">
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-5">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold text-white drop-shadow-sm">Dashboard</h1>
          <div className="flex items-center gap-4 mt-3 md:mt-0">
            {username && (
              <span className="text-lg font-medium text-white/90 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                Welcome, {username}!
              </span>
            )}
            <button
              className="px-5 py-2.5 text-sm font-medium bg-white text-stone-700 rounded-xl hover:bg-stone-100 transition-all flex items-center gap-2 shadow-sm hover:shadow-md"
              onClick={handleLogout}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Room Actions */}
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-sm border border-stone-200/70 p-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <button
          className="w-full md:w-auto px-6 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-medium hover:from-amber-600 hover:to-amber-700 transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
          onClick={() => navigate("/create-room")}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Create New Room
        </button>

        <div className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <input
              type="text"
              className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 bg-white text-stone-800"
              value={joinRoomCode}
              onChange={(e) => setJoinRoomCode(e.target.value)}
              placeholder="Enter room code"
            />
          </div>
          <button
            className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-stone-600 to-stone-700 text-white rounded-xl hover:from-stone-700 hover:to-stone-800 transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
            onClick={handleJoinRoom}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Join Room
          </button>
        </div>
      </div>
    </div>

    {/* Created Rooms */}
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-sm border border-stone-200/70">
      <div className="p-5 border-b border-stone-200/50">
        <h2 className="text-xl font-semibold text-stone-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          Your Rooms
        </h2>
      </div>
      <div className="p-6">
        {createdRooms.length === 0 ? (
          <div className="text-center py-8 text-stone-600">
            <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-stone-100 text-stone-400 mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-stone-700">No rooms created yet</h3>
            <p className="text-sm">Click "Create New Room" above to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {createdRooms.map((room) => (
              <div key={room.id} className="relative group">
                <Link
                  to={`/room/${room.id}`}
                  className="block bg-white/95 hover:bg-amber-50 transition-all border border-stone-200/60 p-5 rounded-xl shadow-sm h-36 flex flex-col justify-between hover:shadow-md hover:border-amber-300"
                >
                  <h3 className="text-lg font-medium text-stone-800 truncate">{room.name || "New Room"}</h3>
                  <div className="flex items-center gap-2 text-sm text-stone-600 mt-4">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span>Code: {room.join_code}</span>
                  </div>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    handleDeleteRoom(room.id);
                  }}
                  className="absolute top-3 right-3 p-1.5 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100 transition-all opacity-0 group-hover:opacity-100"
                  title="Delete room"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Joined Rooms */}
    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-sm border border-stone-200/70">
      <div className="p-5 border-b border-stone-200/50">
        <h2 className="text-xl font-semibold text-stone-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Joined Rooms
        </h2>
      </div>
      <div className="p-6">
        {joinedRooms.length === 0 ? (
          <div className="text-center py-8 text-stone-600">
            <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-stone-100 text-stone-400 mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium">No joined rooms</h3>
            <p className="text-sm">Use a code above to join one</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-5">
            {joinedRooms.map((room) => (
              <div key={room.id} className="min-w-[250px] flex-1">
                <Link
                  to={`/room/${room.id}`}
                  className="block bg-white/95 hover:bg-amber-50 transition-all border border-stone-200/60 p-5 rounded-xl shadow-sm h-36 flex flex-col justify-between hover:shadow-md hover:border-amber-300"
                >
                  <h3 className="text-lg font-medium text-stone-800 truncate">{room.name || "Room"}</h3>
                  <div className="mt-4 text-sm text-stone-600 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    Code: {room.join_code}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    
  </div>
</div>



  );
};

export default Dashboard;