"""End-to-end contract checks for the tiny Flask multiplayer game."""
import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[1] / "app.py"
spec = importlib.util.spec_from_file_location("game_app", path)
game = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = game
spec.loader.exec_module(game)


class PartyGameTests(unittest.TestCase):
    def setUp(self):
        self.client = game.app.test_client()
        with game.LOCK:
            game.ROOMS.clear()

    def post(self, endpoint, data, expected=200):
        response = self.client.post(endpoint, json=data)
        self.assertEqual(response.status_code, expected, response.get_json())
        return response.get_json()

    def get_state(self, room, token):
        response = self.client.get("/api/state", query_string={"room": room, "token": token})
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def create(self, name, demo=False):
        return self.post("/api/create", {"name": name, "demo": demo})

    def join(self, room, name):
        return self.post("/api/join", {"room": room, "name": name})

    def action(self, player, action, **extra):
        return self.post("/api/action", {"room": player["room"], "token": player["token"],
                                          "action": action, **extra})

    def test_three_players_make_hidden_choices_and_guess_identities(self):
        alice = self.create("Alice")
        bob = self.join(alice["room"], "Bob")
        cory = self.join(alice["room"], "Cory")
        names = {p["name"]: p["id"] for p in alice["state"]["players"]}
        self.assertEqual(len(names), 1)
        self.action(alice, "start")
        first = self.get_state(alice["room"], alice["token"])
        self.assertEqual(first["phase"], "choose")
        self.assertEqual(len(first["scenario"]["options"]), 3)
        self.assertNotIn("decisions", first)
        self.assertNotIn("guesses", first)
        self.action(alice, "decide", option=0)
        hidden = self.get_state(alice["room"], bob["token"])
        self.assertEqual(hidden["decisionCount"], 1)
        self.assertIsNone(hidden["yourDecision"])
        self.assertEqual(hidden["anonymousCounts"], [0,0,0])
        self.action(bob, "decide", option=1)
        self.action(cory, "decide", option=2)
        state = self.get_state(alice["room"], alice["token"])
        self.assertEqual(state["phase"], "guess")
        self.assertEqual(state["anonymousCounts"], [1,1,1])
        self.assertIsNone(state["result"])
        aids = {p["name"]: p["id"] for p in state["players"]}
        self.post("/api/action", {"room": alice["room"], "token": alice["token"], "action": "guess",
                                 "guesses": {aids["Bob"]: 1, aids["Cory"]: 2}})
        self.post("/api/action", {"room": bob["room"], "token": bob["token"], "action": "guess",
                                 "guesses": {aids["Alice"]: 1, aids["Cory"]: 2}})
        result = self.post("/api/action", {"room": cory["room"], "token": cory["token"], "action": "guess",
                                            "guesses": {aids["Alice"]: 0, aids["Bob"]: 0}})
        self.assertEqual(result["state"]["phase"], "reveal")
        self.assertEqual(result["state"]["result"]["decisions"],
                         {aids["Alice"]: 0, aids["Bob"]: 1, aids["Cory"]: 2})
        gains = result["state"]["result"]["gains"]
        self.assertEqual(gains[aids["Alice"]], 5)
        self.assertEqual(gains[aids["Bob"]], 3)
        self.assertEqual(gains[aids["Cory"]], 2)
        self.assertEqual(sum(p["score"] for p in result["state"]["players"]), 10)
        self.assertEqual(self.get_state(alice["room"], alice["token"])["result"], result["state"]["result"])

    def test_demo_completes_five_rounds_without_external_players(self):
        host = self.create("Demo Host", demo=True)
        room = host["room"]
        self.assertEqual(len(host["state"]["players"]), 4)
        self.action(host, "start")
        for round_number in range(1, 6):
            state = self.get_state(room, host["token"])
            self.assertEqual(state["phase"], "choose")
            self.assertEqual(state["round"], round_number)
            self.assertEqual(state["decisionCount"], 3)
            self.action(host, "decide", option=round_number % 3)
            state = self.get_state(room, host["token"])
            self.assertEqual(state["phase"], "guess")
            self.assertEqual(sum(state["anonymousCounts"]), 4)
            guesses = {p["id"]: round_number % 3 for p in state["players"] if p["id"] != host["token"]}
            self.action(host, "guess", guesses=guesses)
            outcome = self.get_state(room, host["token"])
            self.assertEqual(outcome["phase"], "reveal")
            self.assertEqual(len(outcome["result"]["decisions"]), 4)
            self.action(host, "next")
        ended = self.get_state(room, host["token"])
        self.assertEqual(ended["phase"], "finished")
        self.assertEqual(ended["round"], 5)
        self.action(host, "again")
        restarted = self.get_state(room, host["token"])
        self.assertEqual(restarted["round"], 1)
        self.assertEqual(restarted["phase"], "choose")
        self.assertTrue(all(p["score"] == 0 for p in restarted["players"]))

    def test_invalid_moves_and_authorization_are_rejected(self):
        host = self.create("Host")
        guest = self.join(host["room"], "Guest")
        self.post("/api/join", {"room": host["room"], "name": "Guest"}, expected=400)
        self.post("/api/action", {"room": host["room"], "token": guest["token"], "action": "start"}, expected=403)
        self.action(host, "start")
        self.post("/api/action", {"room": host["room"], "token": host["token"],
                                  "action": "decide", "option": True}, expected=400)
        self.action(host, "decide", option=0)
        self.post("/api/action", {"room": host["room"], "token": host["token"],
                                  "action": "decide", "option": 2}, expected=409)
        self.action(guest, "decide", option=1)
        self.post("/api/action", {"room": host["room"], "token": host["token"],
                                  "action": "guess", "guesses": {host["token"]: 2}}, expected=400)
        self.post("/api/action", {"room": host["room"], "token": host["token"],
                                  "action": "guess", "guesses": {guest["token"]: 3}}, expected=400)
        self.post("/api/action", {"room": host["room"], "token": "unknown",
                                  "action": "guess", "guesses": {}}, expected=404)

    def test_timed_out_round_advances_and_absent_choices_are_filled(self):
        host = self.create("Host")
        guest = self.join(host["room"], "Guest")
        self.action(host, "start")
        with game.LOCK:
            room = game.ROOMS[host["room"]]
            room.deadline = game.now() - 1
        choosing = self.get_state(host["room"], host["token"])
        self.assertEqual(choosing["phase"], "guess")
        self.assertEqual(sum(choosing["anonymousCounts"]), 2)
        with game.LOCK:
            room.deadline = game.now() - 1
        outcome = self.get_state(host["room"], host["token"])
        self.assertEqual(outcome["phase"], "reveal")
        self.assertEqual(outcome["result"]["guessesSubmitted"], 0)
        self.assertEqual(sum(p["score"] for p in outcome["players"]), 0)

    def test_rejoin_keeps_player_identity_after_refresh(self):
        host = self.create("Rita")
        self.action(host, "start") if False else None
        joined = self.post("/api/join", {"room": host["room"], "token": host["token"]})
        self.assertEqual(joined["token"], host["token"])
        self.assertEqual(len(joined["state"]["players"]), 1)
        self.assertEqual(joined["state"]["you"], host["token"])

    def test_event_stream_starts_with_private_state(self):
        host = self.create("Host", demo=True)
        self.action(host, "start")
        response = self.client.get("/api/events", query_string={
            "room": host["room"], "token": host["token"]
        }, buffered=False)
        try:
            initial = next(response.response).decode("utf-8")
            self.assertIn("event: state", initial)
            self.assertIn('"phase": "choose"', initial)
            self.assertNotIn('"decisions"', initial)
        finally:
            response.close()


if __name__ == "__main__":
    unittest.main()
