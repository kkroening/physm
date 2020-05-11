package us.kralnet.redgen;

import java.util.HashMap;

import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.util.ChunkCoordinates;

public class PlayerInfo {
    private EntityPlayer player;
    private BlockBuffer buffer;

    private HashMap<Integer, Position> positions = new HashMap<Integer, Position>();

    public class Position {
        public double x;
        public double y;
        public double z;

        Position(double x, double y, double z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }

    public PlayerInfo(EntityPlayer player) {
        this.player = player;
    }

    public EntityPlayer getPlayer() {
        return player;
    }

    public Position getPos(int id) {
        return positions.get(id);
    }

    public Position getPosFloor(int id) {
        Position pos = positions.get(id);
        if (pos != null) {
            return new Position(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
        } else {
            return null;
        }
    }

    public void setPos(int id, double x, double y, double z) {
        positions.put(id, new Position(x, y, z));
    }

    public void clearPos(int id) {
        positions.remove(id);
    }

    public BlockBuffer getBuffer() {
        return buffer;
    }

    public void setBuffer(BlockBuffer buffer) {
        this.buffer = buffer;
    }
}
