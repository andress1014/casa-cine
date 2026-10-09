package com.andress1014.casacine.tv;

import org.json.JSONObject;

public final class Game {
    public String id,title,system,addedBy,cover;
    public static Game fromJson(JSONObject value) {
        Game game = new Game(); game.id = value.optString("id"); ServerClient.validateId(game.id);
        game.title = value.optString("title","Juego"); game.system = value.optString("system");
        if (!"psx".equals(game.system) && !"snes".equals(game.system)) throw new IllegalArgumentException("Consola no compatible.");
        game.addedBy = value.optString("addedBy",""); game.cover = value.isNull("cover") ? "" : value.optString("cover","");
        return game;
    }
    public String console() { return "psx".equals(system) ? "PlayStation 1" : "Super Nintendo"; }
}
