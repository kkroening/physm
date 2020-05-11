(ns pumpr.core-test
  (:require [pumpr.core :as p]
            #?(:clj [clojure.test :refer [deftest is testing]]
               :cljs [cljs.test :refer-macros [deftest is testing]])))

(deftest test-sinput
  (is (= {:type :input, :id :foo} (p/sinput :foo))))

(deftest test-extend-streams
  ;(is (=
  ;     {:type :example}
  ;     (p/extend-streams {:type :example} [])))
  (is (=
       {:type :example, :parents [(p/sinput :foo) (p/sinput :bar)]}
       (p/extend-streams {:type :example} [(p/sinput :foo) (p/sinput :bar)]))))

(deftest test-soutput
  (is (=
       {:type :output, :id :out, :parents [(p/sinput :in)]}
       (->> (p/sinput :in)
            (p/soutput :out)))))

(deftest test-smap
  (is (=
       {:type :map, :fn inc, :parents [(p/sinput :in)]}
       (->> (p/sinput :in)
            (p/smap inc)))))

(deftest test-sfilter
  ;(is (=
  ;     {:type :filter, :fn (constantly false), :parents [(p/sinput :in)]}
  ;     (->> (p/sinput :in)
  ;          (p/sfilter))))
  (is (=
       {:type :filter, :fn odd?, :parents [(p/sinput :in)]}
       (->> (p/sinput :in)
            (p/sfilter odd?)))))

(deftest test-smerge
  (is (=
       {:type :merge
        :parents [(p/sinput :in1) (p/sinput :in2)]}
       (p/smerge [(p/sinput :in1) (p/sinput :in2)])))
  (is (=
       {:type :merge
        :parent-labels [:in1 :in2]
        :parents [(p/sinput :in1) (p/sinput :in2)]}
       (p/smerge {:in1 (p/sinput :in1), :in2 (p/sinput :in2)}))))

(deftest test-sdo
  (is (=
       {:type :do
        :fn println
        :parents [(p/sinput :in)]}
       (->> (p/sinput :in)
            (p/sdo println)))))

(deftest test-scell
  (is (= {:type :cell, :id :c, :initial nil}
         (p/scell :c)))
  (is (= {:type :cell, :id :c, :initial 5}
         (p/scell :c 5))))

(deftest test-sload
  (let [c (p/scell :c)
        s (p/sinput :in)]
    (is (= {:type :load, :cell c, :parents [s c]}
           (p/sload c s)))))

(deftest test-sstore
  (let [c (p/scell :c)
        s (p/sinput :in)]
    (is (= {:type :store, :cell c, :parents [s]}
           (p/sstore c s)))))

(deftest test-generate-name
  (is (= :foo887712424 (p/generate-name (p/sinput :in) "foo"))))

