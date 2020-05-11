(ns llvm-example.core)

(defn import-c-func [lib name ret-type num-args]
  (let [fn-name (symbol name)]
    (eval
     `(let [function# (com.sun.jna.Function/getFunction ~lib ~name)]
        (def ~(symbol (str "native-" fn-name)) function#)
        (defn ~fn-name [& args#]
          (assert (= ~num-args (count args#)))
          (.invoke function# ~ret-type (to-array args#)))))))

(let [llvm-api [["LLVMAddFunction" com.sun.jna.Pointer 3]
                ["LLVMAppendBasicBlock" com.sun.jna.Pointer 2]
                ["LLVMBuildFAdd" com.sun.jna.Pointer 4]
                ["LLVMBuildFDiv" com.sun.jna.Pointer 4]
                ["LLVMBuildRet" com.sun.jna.Pointer 2]
                ["LLVMConstReal" com.sun.jna.Pointer 2]
                ["LLVMCreateBuilder" com.sun.jna.Pointer 0]
                ["LLVMCreateExecutionEngineForModule" Integer 3]
                ["LLVMDisposeBuilder" Void 1]
                ["LLVMDisposeExecutionEngine" Void 1]
                ["LLVMDisposeModule" Void 1]
                ["LLVMDisposeMessage" Void 1]
                ["LLVMDoubleType" com.sun.jna.Pointer 0]
                ["LLVMFunctionType" com.sun.jna.Pointer 4]
                ["LLVMGetGlobalValueAddress" com.sun.jna.Pointer 2]
                ["LLVMGetParam" com.sun.jna.Pointer 2]
                ["LLVMInitializeX86AsmPrinter" Void 0]
                ["LLVMInitializeX86Target" Void 0]
                ["LLVMInitializeX86TargetInfo" Void 0]
                ["LLVMInitializeX86TargetMC" Void 0]
                ["LLVMModuleCreateWithName" com.sun.jna.Pointer 1]
                ["LLVMPointerType" com.sun.jna.Pointer 2]
                ["LLVMPositionBuilderAtEnd" com.sun.jna.Pointer 2]
                ["LLVMPrintModuleToString" String 1]
                ["LLVMPrintValueToString" String 1]]]
  (doseq [[name ret-type num-args] llvm-api]
    (import-c-func "LLVM" name ret-type num-args)))

(defn create-execution-engine [llvm-module]
  (let [error-ref  (com.sun.jna.ptr.PointerByReference.)
        engine-ref (com.sun.jna.ptr.PointerByReference.)
        status     (LLVMCreateExecutionEngineForModule engine-ref llvm-module error-ref)
        _          (if-not (= 0 status)
                     (let [error (-> error-ref
                                     (. getValue)
                                     (. getString))]
                       (LLVMDisposeMessage error-ref)
                       (throw (Exception. (str "Failed to create LLVM execution engine: " error)))))
        engine     (. engine-ref getValue)]
    engine))

(LLVMInitializeX86TargetInfo)
(LLVMInitializeX86TargetMC)
(LLVMInitializeX86Target)
(LLVMInitializeX86AsmPrinter)

(defn build-averager-fn [llvm-module builder fn-name]
  (let [args         (into-array [(LLVMDoubleType) (LLVMDoubleType)])
        fn-type      (LLVMFunctionType (LLVMDoubleType) args (count args) 0)
        llvm-fn      (LLVMAddFunction llvm-module fn-name fn-type)
        entry        (LLVMAppendBasicBlock llvm-fn "entry")
        _            (LLVMPositionBuilderAtEnd builder entry)
        arg1         (LLVMGetParam llvm-fn 0)
        arg2         (LLVMGetParam llvm-fn 1)
        adder-result (LLVMBuildFAdd builder arg1 arg2 "")
        const2       (LLVMConstReal (LLVMDoubleType) (double 2.0))
        result       (LLVMBuildFDiv builder adder-result const2 "")]
    (LLVMBuildRet builder result)
    nil))

(comment  ;; Run these commands at the REPL

(use 'llvm-example.core)

(def llvm-mod (LLVMModuleCreateWithName "example"))
(println (LLVMPrintModuleToString llvm-mod))

(def args (into-array [(LLVMDoubleType) (LLVMDoubleType)]))
(def fn-type (LLVMFunctionType (LLVMDoubleType) args (count args) 0))
(def llvm-fn (LLVMAddFunction llvm-mod "average" fn-type))

(def arg1 (LLVMGetParam llvm-fn 0))
(def arg2 (LLVMGetParam llvm-fn 1))
(def entry (LLVMAppendBasicBlock llvm-fn "entry"))
(def builder (LLVMCreateBuilder))
(LLVMPositionBuilderAtEnd builder entry)
(def adder-result (LLVMBuildFAdd builder arg1 arg2 ""))
(def const2 (LLVMConstReal (LLVMDoubleType) (double 2.0)))
(def divider-result (LLVMBuildFDiv builder adder-result const2 ""))
(LLVMBuildRet builder divider-result)
(LLVMDisposeBuilder builder)
(println (LLVMPrintModuleToString llvm-mod))

(def engine (create-execution-engine llvm-mod))
(def fn-ptr (LLVMGetGlobalValueAddress engine "average"))
(def jna-fn (com.sun.jna.Function/getFunction fn-ptr))
(println (.invoke jna-fn Double (into-array [3.0 8.0])))

)

