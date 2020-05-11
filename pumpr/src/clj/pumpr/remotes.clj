(ns pumpr.remotes 
  (:require [shoreleave.middleware.rpc :refer [defremote]]))

(defremote example [foo]
  (* foo 2))

