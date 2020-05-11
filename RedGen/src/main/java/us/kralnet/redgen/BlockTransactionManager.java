package us.kralnet.redgen;

import java.util.List;
import java.util.Stack;

/** Records block operations and supports undo.
 */
class BlockTransactionManager {
    Stack<BlockTransaction> transactions = new Stack<BlockTransaction>();
    Stack<BlockTransaction> redoTransactions = new Stack<BlockTransaction>();

    /** Undo the last transaction.
     */
    public boolean undoTransaction() {
        if (!transactions.empty()) {
            BlockTransaction t = transactions.peek();
            if (t.undo()) {
                transactions.pop();
                redoTransactions.push(t);
                return true;
            }
        }
        return false;
    }

    public boolean redoTransaction() {
        if (!redoTransactions.empty()) {
            BlockTransaction t = redoTransactions.peek();
            if (t.redo()) {
                redoTransactions.pop();
                transactions.push(t);
                return true;
            }
        }
        return false;
    }

    /** Record a transaction.
     */
    public void addTransaction(BlockTransaction transaction) {
        transactions.add(transaction);
        redoTransactions.clear();
    }

    public boolean haveTransactions() {
        return !transactions.empty();
    }

    public boolean haveRedoTransactions() {
        return !redoTransactions.empty();
    }

    public void clearRedo() {
        redoTransactions.clear();
    }
}
