import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Auth from "./Auth";
import Username from "./Username";
import Dashboard from "./Dashboard";
import CreateRoom from "./CreateRoom";
import Room from "./Room";

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/username" element={<Username />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/create-room" element={<CreateRoom />} />
        <Route path="/room/:id" element={<Room />} />
      </Routes>
    </Router>
  );
};

export default App;


