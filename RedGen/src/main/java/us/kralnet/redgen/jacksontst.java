package us.kralnet.redgen;

import java.io.IOException;
import com.fasterxml.jackson.databind.ObjectMapper;


public class jacksontst {
    public static String tst() {
        ObjectMapper mapper = new ObjectMapper();
        MyValue value;
        try {
            value = mapper.readValue("{\"name\":\"Bob\", \"age\":13}", MyValue.class);
            return value.name + " " + value.age;
        } catch (IOException e) {
            return "Exception: " + e.getMessage();
        }
    }

    public static void main(String[] args) {
    	System.out.println(tst());
    }
}
