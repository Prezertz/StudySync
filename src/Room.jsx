import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import "./Room.css";
import { FaTrash } from "react-icons/fa";

const isValidUUID = (uuid) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);

const Room = ({ onRoomDeleted }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [files, setFiles] = useState([]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("assignment");

  useEffect(() => {
    if (!isValidUUID(id)) return;

    const fetchRoomData = async () => {
      const [{ data: room, error: roomError }, { data: userResult, error: userError }] =
        await Promise.all([
          supabase.from("rooms").select("name, join_code, created_by").eq("id", id).single(),
          supabase.auth.getUser(),
        ]);

      if (roomError) console.error("Room error:", roomError);
      else {
        setRoomName(room.name);
        setJoinCode(room.join_code);
        setCreatedBy(room.created_by);
      }

      if (userError || !userResult?.user) {
        console.error("User error:", userError);
      } else {
        setCurrentUserId(userResult.user.id);
      }

      // Initial fetch for files and comments
      const [{ data: filesData }, { data: commentsData }] = await Promise.all([
        supabase.from("files").select("file_name, file_url, uploaded_by, category").eq("room_id", id),
        supabase
          .from("comments")
          .select("id, user_id, content, created_at, profiles(username)")
          .eq("room_id", id)
          .order("created_at", { ascending: true })
      ]);

      if (filesData) setFiles(filesData);
      if (commentsData) setComments(commentsData);
    };

    fetchRoomData();

    // Set up real-time subscriptions
    const filesChannel = supabase
      .channel('files_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'files',
          filter: `room_id=eq.${id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setFiles(prev => [...prev, payload.new]);
          } else if (payload.eventType === 'DELETE') {
            setFiles(prev => prev.filter(file => file.file_url !== payload.old.file_url));
          } else if (payload.eventType === 'UPDATE') {
            setFiles(prev => prev.map(file => 
              file.file_url === payload.old.file_url ? payload.new : file
            ));
          }
        }
      )
      .subscribe();

    const commentsChannel = supabase
      .channel('comments_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `room_id=eq.${id}`
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch the username for the new comment
            const { data: userProfile } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', payload.new.user_id)
              .single();

            setComments(prev => [
              ...prev,
              {
                ...payload.new,
                profiles: { username: userProfile?.username || 'Anonymous' }
              }
            ]);
          } else if (payload.eventType === 'DELETE') {
            setComments(prev => prev.filter(comment => comment.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(filesChannel);
      supabase.removeChannel(commentsChannel);
    };
  }, [id]);

  const uploadFiles = useCallback(
    async (selectedFiles) => {
      if (!isValidUUID(id)) return;

      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return;

      for (const file of selectedFiles) {
        if (file.size > 10 * 1024 * 1024) {
          alert(`File "${file.name}" exceeds the 10MB limit and was not uploaded.`);
          continue;
        }

        const timestamp = Date.now();
        const path = `rooms/${id}/${timestamp}_${file.name}`;

        const { error: uploadError } = await supabase.storage.from("uploads").upload(path, file);
        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from("uploads").getPublicUrl(path);

        await supabase.from("files").insert([
          {
            room_id: id,
            uploaded_by: user.id,
            file_name: file.name,
            file_url: publicUrl,
            file_size: file.size,
            category: uploadCategory,
          },
        ]);
      }
    },
    [id, uploadCategory]
  );

  const deleteFile = async (file) => {
    if (!currentUserId || currentUserId !== file.uploaded_by) return;

    const path = file.file_url.split("/storage/v1/object/public/uploads/")[1];
    if (!path) return;

    const { error: storageError } = await supabase.storage.from("uploads").remove([path]);
    if (storageError) return console.error("Storage deletion error:", storageError);

    await supabase.from("files").delete().eq("file_url", file.file_url);
  };

  const handleDeleteRoom = async () => {
    if (!window.confirm("Are you sure you want to delete this room and all its data?")) return;
    setIsDeleting(true);

    try {
      const { data: roomFiles, error: fetchFilesError } = await supabase
        .from("files")
        .select("file_url")
        .eq("room_id", id);

      if (fetchFilesError) throw fetchFilesError;

      const filePaths = roomFiles
        .map((f) => f.file_url.split("/storage/v1/object/public/uploads/")[1])
        .filter(Boolean);

      if (filePaths.length) {
        const { error: storageDeleteError } = await supabase.storage
          .from("uploads")
          .remove(filePaths);
        if (storageDeleteError) throw storageDeleteError;
      }

      await Promise.all([
        supabase.from("comments").delete().eq("room_id", id),
        supabase.from("files").delete().eq("room_id", id),
        supabase.from("room_members").delete().eq("room_id", id),
      ]);

      const { error: roomDeleteError } = await supabase
        .from("rooms")
        .delete()
        .eq("id", id)
        .eq("created_by", currentUserId);

      if (roomDeleteError) throw roomDeleteError;

      onRoomDeleted(id);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Error deleting room:", error);
      alert("Failed to delete room. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFileChange = (e) => uploadFiles(Array.from(e.target.files));
  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };
  const handleDragLeave = () => setDragActive(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return;

    await supabase
      .from("comments")
      .insert([{ room_id: id, user_id: user.id, content: newComment.trim() }]);
      
    setNewComment("");
  };

  

  return (
  <div className="min-h-screen bg-gradient-to-br from-stone-50 to-amber-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
  <div className="max-w-5xl mx-auto space-y-10">
    
    {/* Room Header */}
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <h1 className="text-3xl font-semibold text-gray-800 mb-4">
        {isValidUUID(id) ? roomName : "Invalid Room"}
      </h1>

      {isValidUUID(id) && currentUserId === createdBy && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50 border border-gray-200 p-4 rounded-lg">
            <p className="text-sm text-gray-700">
              <strong>Join Code:</strong>{" "}
              <code className="bg-gray-100 text-sm px-2 py-1 rounded font-mono">{joinCode}</code>
            </p>
            <button
              onClick={copyToClipboard}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <button
            onClick={handleDeleteRoom}
            disabled={isDeleting}
            className="w-full py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition"
          >
            {isDeleting ? "Deleting..." : "🗑 Delete Room"}
          </button>
        </div>
      )}
    </section>

    {isValidUUID(id) && (
      <section className="space-y-10">
        
        {/* File Upload Section */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-xl text-center p-6 transition ${
              dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
            }`}
          >
            <h2 className="text-lg font-medium text-gray-800 mb-4">Upload Files</h2>

            <div className="text-left mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-1">Select Category</label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-800 focus:ring-blue-300 focus:border-blue-300"
              >
                <option value="assignment">Assignment</option>
                <option value="notes">Notes & Resources</option>
              </select>
            </div>

            <label
              htmlFor="file-upload"
              className="cursor-pointer text-sm text-gray-600 hover:text-blue-600"
            >
              📁 Drag & drop files, or{" "}
              <span className="text-blue-600 underline">browse</span>
              <input
                id="file-upload"
                type="file"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        </section>

        {/* Files List */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-medium text-gray-800 mb-4">Uploaded Files</h2>
          {files.length === 0 ? (
            <p className="text-sm text-gray-500 p-4 bg-gray-50 rounded-md">
              No files uploaded yet.
            </p>
          ) : (
            <div className="space-y-6">
              {["assignment", "notes"].map((categoryKey) => {
                const label =
                  categoryKey === "assignment" ? "Assignments" : "Notes & Resources";
                const filtered = files.filter((f) => f.category === categoryKey);

                return (
                  <div key={categoryKey} className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-600 mb-2">{label}</h3>
                    {filtered.length === 0 ? (
                      <p className="text-sm text-gray-400 p-3 bg-gray-50 rounded-md">
                        No {label.toLowerCase()} uploaded.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {filtered.map((file) => (
                          <li
                            key={file.file_url}
                            className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 transition"
                          >
                            <div className="flex items-center gap-3 text-sm">
                              <span className="text-gray-500">📄</span>
                              <a
                                href={file.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {file.file_name}
                              </a>
                            </div>
                            {file.uploaded_by === currentUserId && (
                              <button
                                onClick={() => deleteFile(file)}
                                className="text-gray-500 hover:text-red-600 transition p-1"
                                title="Delete file"
                              >
                                <FaTrash />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Comments */}
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-medium text-gray-800 mb-4">Comments</h2>
          <ul className="space-y-4 mb-6">
            {comments.length === 0 ? (
              <li className="text-sm text-gray-500 p-4 bg-gray-50 rounded-md">
                No comments yet.
              </li>
            ) : (
              comments.map((comment) => (
                <li
                  key={comment.id}
                  className="bg-gray-50 border border-gray-200 rounded-md p-4"
                >
                  <p className="text-sm text-gray-700 mb-2">{comment.content}</p>
                  <span className="text-xs text-gray-500">
                    <strong>{comment.profiles?.username || "Anonymous"}</strong> ·{" "}
                    {new Date(comment.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))
            )}
          </ul>

          <form onSubmit={handleCommentSubmit} className="space-y-4">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              rows="4"
              className="w-full p-3 border border-gray-300 rounded-md shadow-sm text-sm text-gray-800 bg-white focus:ring-2 focus:ring-blue-300 focus:outline-none"
            />
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
            >
              Post Comment
            </button>
          </form>
        </section>
      </section>
    )}
  </div>
</div>


  );
};

export default Room;
