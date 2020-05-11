(ns pumpr.server
  (:require [pumpr.core :as p]
            [compojure.core :refer [defroutes GET POST]]
            [compojure.route :refer [not-found files resources]]
            [compojure.handler :refer [site]]
            [shoreleave.middleware.rpc :refer [wrap-rpc]]))

;(def out
;  (->>
;    (p/sinput :in)
;    (p/smap #(* % 2))
;    (p/soutput :out)
;    (p/run {:in 3})))

(defroutes handler
  ;(GET "/" [] (str out))
  (files "/" {:root "target"})
  (resources "/" {:root "target"})
  (not-found "Page Not Found"))

(def app
  (-> handler
      (wrap-rpc)
      (site)))
