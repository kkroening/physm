package us.kralnet.redgen;

import net.minecraft.command.CommandBase;
import net.minecraft.command.ICommandSender;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.util.ChatComponentText;
import net.minecraft.world.World;

public class ClearCommand extends CommandBase {
    @Override
    public String getCommandName() {
        return "clr";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] params) {
        if (sender instanceof EntityPlayer) {
            EntityPlayer player = (EntityPlayer) sender;
            PlayerInfo info = RedGen.getInstance().getPlayerInfo(player);
            PlayerInfo.Position pos1 = info.getPosFloor(1);
            PlayerInfo.Position pos2 = info.getPosFloor(2);
            if (pos1 == null || pos2 == null) {
                player.addChatMessage(new ChatComponentText("Please specify positions with /pos1 and /pos2."));
            } else {
                run(player.getEntityWorld(), (int) pos1.x, (int) Math.min(pos1.y, pos2.y), (int) pos1.z, (int) pos2.x, 255, (int) pos2.z);
            }
        }
    }

    private void run(World world, int x1, int y1, int z1, int x2, int y2, int z2) {
        int xmin = Math.min(x1, x2);
        int ymin = Math.min(y1, y2);
        int zmin = Math.min(z1, z2);
        int xmax = Math.max(x1, x2);
        int ymax = Math.max(y1, y2);
        int zmax = Math.max(z1, z2);
        for (int x = xmin; x < xmax; x++) {
            for (int y = ymin; y < ymax; y++) {
                for (int z = zmin; z < zmax; z++) {
                    world.setBlockToAir(x, y, z);
                }
            }
        }
    }
}
