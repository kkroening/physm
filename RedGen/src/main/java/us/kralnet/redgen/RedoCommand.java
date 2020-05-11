package us.kralnet.redgen;

import net.minecraft.command.CommandBase;
import net.minecraft.command.ICommandSender;
import net.minecraft.entity.player.EntityPlayer;
import net.minecraft.init.Blocks;
import net.minecraft.util.ChatComponentText;
import net.minecraft.world.World;

public class RedoCommand extends CommandBase {
    @Override
    public String getCommandName() {
        return "redo";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "";
    }

    @Override
    public void processCommand(ICommandSender sender, String[] params) {
        if (sender instanceof EntityPlayer) {
            EntityPlayer player = (EntityPlayer) sender;
            String message;
            BlockTransactionManager tm = RedGen.getInstance().getTransactionManager();
            if (!tm.haveRedoTransactions()) {
                message = "There is nothing to redo.";
            } else if (tm.redoTransaction()) {
                message = "Redo complete.";
            } else {
                message = "Redo failed!";
            }
            player.addChatMessage(new ChatComponentText(message));
        }
    }
}
