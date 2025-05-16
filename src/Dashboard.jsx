import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import { FaUserAlt } from "react-icons/fa";  // Import profile icon
import "./Dashboard.css";

const Dashboard = () => {
  const [createdRooms, setCreatedRooms] = useState([]);
  const [joinedRooms, setJoinedRooms] = useState([]);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState(null);  // Add username state
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

      // Fetch user profile data (e.g., username)
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Error fetching user profile:", profileError);
      } else {
        setUsername(userProfile.username);  // Set the username
      }

      const { data: userCreatedRooms, error: createdError } = await supabase
        .from("rooms")
        .select("*")
        .eq("created_by", user.id);

      if (createdError) {
        console.error("Error fetching created rooms:", createdError);
      } else {
        setCreatedRooms(userCreatedRooms);
      }

      const { data: memberRecords, error: memberError } = await supabase
        .from("room_members")
        .select("room_id")
        .eq("user_id", user.id);

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
          .neq("created_by", user.id);

        if (roomsError) {
          console.error("Error fetching joined rooms:", roomsError);
        } else {
          setJoinedRooms(roomsJoined);
        }
      }
    };

    fetchUserRooms();
  }, []);

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
    <div className="page-center">
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div className="flex items-center gap-10">
            <FaUserAlt className="w-8 h-8" />
            {username && <span className="text-lg">Hello, {username}!</span>}
          </div>
          <button className="logout-button" onClick={handleLogout}>
            Log Out
          </button>
        </div>

        <div className="action-container">
          <button
            className="create-room-button"
            onClick={() => navigate("/create-room")}
          >
            Create Room
          </button>
          <div className="join-room-container">
            <input
              type="text"
              className="join-room-input"
              value={joinRoomCode}
              onChange={(e) => setJoinRoomCode(e.target.value)}
              placeholder="Enter room join code"
            />
            <button className="join-room-button" onClick={handleJoinRoom}>
              Join Room
            </button>
          </div>
        </div>

        <div className="rooms-section">
          <h2 className="rooms-title">Your Created Rooms</h2>
          {createdRooms.length === 0 ? (
            <p className="no-rooms">No rooms created yet.</p>
          ) : (
            <ul className="rooms-list">
              {createdRooms.map((room) => (
                <li key={room.id} className="room-item">
                  <Link to={`/room/${room.id}`} className="room-link">
                    {room.name || "Unnamed Room"}
                  </Link>
                  <p className="room-code">Code: {room.join_code}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rooms-section">
          <h2 className="rooms-title">Rooms You Joined</h2>
          {joinedRooms.length === 0 ? (
            <p className="no-rooms">No joined rooms yet.</p>
          ) : (
            <ul className="rooms-list">
              {joinedRooms.map((room) => (
                <li key={room.id} className="room-item">
                  <Link to={`/room/${room.id}`} className="room-link">
                    {room.name || "Unnamed Room"}
                  </Link>
                  <p className="room-code">Code: {room.join_code}</p>
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
