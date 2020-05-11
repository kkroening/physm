(ns pumpr.util)

#?(:cljs (enable-console-print!))

(def big-integer 9999999) ;; FIXME

(defn make-exception [message]
  #?(:clj  (Exception. message)
     :cljs (js/Error. message)))

