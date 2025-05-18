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
    <div className="min-h-screen bg-gray-100 py-10 px-4 font-sans text-gray-900">
  <div className="max-w-6xl mx-auto space-y-10">
    {/* Header */}
    <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
      <div className="flex items-center gap-6">
        {username && <span className="text-lg font-medium text-black">Hello, {username}!</span>}
        <button
          className="px-4 py-2 text-sm font-medium bg-black text-white rounded-lg hover:bg-red-600 transition"
          onClick={handleLogout}
        >
          Log Out
        </button>
      </div>
    </div>

    {/* Create/Join Actions */}
    <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-white p-6 rounded-2xl shadow">
      <button
        className="w-full md:w-auto px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-blue-700 transition"
        onClick={() => navigate("/create-room")}
      >
        ➕ Create Room
      </button>

      <div className="flex w-full md:w-auto flex-col sm:flex-row items-center gap-3">
        <input
          type="text"
          className="w-full sm:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={joinRoomCode}
          onChange={(e) => setJoinRoomCode(e.target.value)}
          placeholder="Enter room join code"
        />
        <button
          className="w-full sm:w-auto px-6 py-2 bg-black text-white rounded-lg hover:bg-green-700 transition"
          onClick={handleJoinRoom}
        >
          Join Room
        </button>
      </div>
    </div>

    {/* Created Rooms Section */}
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Your Created Rooms</h2>
      {createdRooms.length === 0 ? (
        <p className="text-gray-500">No rooms created yet.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {createdRooms.map((room) => (
            <li key={room.id} className="relative">
              <Link
                to={`/room/${room.id}`}
                className="block bg-white hover:bg-blue-50 transition border border-gray-200 p-4 rounded-xl shadow h-32 flex flex-col justify-between"
              >
                <div className=" font-medium text-lg text-gray-600 truncate">
                  {room.name || "Unnamed Room"}
                </div>
                <p className="text-sm text-gray-500">Code: {room.join_code}</p>
              </Link>
              <button
                onClick={() => handleDeleteRoom(room.id)}
                className="absolute top-2 right-2 text-black bg-gray-300 hover:text-red-800"
                title="Delete room"
              >
                <FaTrash />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>

    {/* Joined Rooms Section */}
   <div className="bg-white p-6 rounded-2xl shadow space-y-4">
  <h2 className="text-xl font-semibold">Rooms You Joined</h2>
  {joinedRooms.length === 0 ? (
    <p className="text-gray-500">No joined rooms yet.</p>
  ) : (
    <ul className="flex flex-wrap gap-4 overflow-x-auto">
      {joinedRooms.map((room) => (
        <li key={room.id} className="min-w-[250px] flex-shrink-0">
          <Link
            to={`/room/${room.id}`}
            className="block bg-white hover:bg-blue-50 transition border border-gray-200 p-4 rounded-xl shadow h-32 flex flex-col justify-between"
          >
            <span className="text-black font-medium block">
              {room.name || "Unnamed Room"}
            </span>
            <p className="text-sm text-gray-500">Code: {room.join_code}</p>
          </Link>
        </li>
      ))}
    </ul>
  )}
</div>


  </div>
</div>


  );
};

export default Dashboard;