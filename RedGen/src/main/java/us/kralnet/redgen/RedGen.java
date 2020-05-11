package us.kralnet.redgen;

import java.util.HashMap;

import net.minecraft.entity.player.EntityPlayer;

import cpw.mods.fml.common.Mod;
import cpw.mods.fml.common.Mod.EventHandler;
import cpw.mods.fml.common.event.FMLServerStartingEvent;

@Mod(modid = RedGen.MODID, version = RedGen.VERSION)
public class RedGen {
    static final int GROUND_HEIGHT = 56;

    public static final String MODID = "RedGen";
    public static final String VERSION = "1.7.2-1.0";

    private HashMap<EntityPlayer, PlayerInfo> playerMap = new HashMap<EntityPlayer, PlayerInfo>();
    private BlockTransactionManager transactionManager = new BlockTransactionManager();

    private static RedGen instance;
    
    @EventHandler
    public void serverLoad(FMLServerStartingEvent event) {
        instance = this;
        event.registerServerCommand(new RedGenCommand());
        event.registerServerCommand(new ClearCommand());
        event.registerServerCommand(new PosCommand());
        event.registerServerCommand(new Pos1Command());
        event.registerServerCommand(new Pos2Command());
        event.registerServerCommand(new RouteCommand());
        event.registerServerCommand(new MetaCommand());
        event.registerServerCommand(new CopyCommand());
        event.registerServerCommand(new PasteCommand());
        event.registerServerCommand(new UndoCommand());
        event.registerServerCommand(new RedoCommand());
        event.registerServerCommand(new MazeGenCommand());
    }

    public static RedGen getInstance() {
        return instance;
    }

    public BlockTransactionManager getTransactionManager() {
        return transactionManager;
    }

    public PlayerInfo getPlayerInfo(EntityPlayer player) {
        PlayerInfo info = playerMap.get(player);
        if (info == null) {
            info = new PlayerInfo(player);
            playerMap.put(player, info);
        }
        return info;
    }
}
