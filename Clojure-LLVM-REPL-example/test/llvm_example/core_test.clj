(ns llvm-example.core-test
  (:require [clojure.test :refer :all]
            [llvm-example.core :refer :all]))

(defmacro with-llvm-module-builder [llvm-module builder & body]
  "Run a body of code with an empty LLVM module declared as ~llvm-module and builder declared as ~builder, and perform
  necessary cleanup afterwards."
  `(let [~llvm-module (LLVMModuleCreateWithName "test")]
     (try
        (let [~builder (LLVMCreateBuilder)]
          (try ~@body
            (finally (LLVMDisposeBuilder ~builder))))
        (finally (LLVMDisposeModule ~llvm-module)))))

(deftest test-empty-module
  (with-llvm-module-builder llvm-module builder
      (is (= "; ModuleID = 'test'\n"
             (LLVMPrintModuleToString llvm-module)))))

(deftest test-build-averager-fn-codegen
  (with-llvm-module-builder llvm-module builder
    (build-averager-fn llvm-module builder "average")
    (is (= (str "; ModuleID = 'test'\n"
                "\n"
                "define double @average(double, double) {\n"
                "entry:\n"
                "  %2 = fadd double %0, %1\n"
                "  %3 = fdiv double %2, 2.000000e+00\n"
                "  ret double %3\n"
                "}\n")
           (LLVMPrintModuleToString llvm-module)))))

(deftest test-build-avenger-fn-execution
  (with-llvm-module-builder llvm-module builder
    (build-averager-fn llvm-module builder "average")
    (let [engine (create-execution-engine llvm-module)]
      (try
        (let [fn-ptr (LLVMGetGlobalValueAddress engine "average")
              jna-fn (com.sun.jna.Function/getFunction fn-ptr)]
          (is (= 5.5 (.invoke jna-fn Double (into-array [3.0 8.0])))))
        (finally
          ;(LLVMDisposeExecutionEngine engine)  ;; FIXME: blows up
          )))))

