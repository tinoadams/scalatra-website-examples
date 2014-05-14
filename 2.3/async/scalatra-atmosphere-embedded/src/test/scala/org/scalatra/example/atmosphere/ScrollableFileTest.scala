package org.scalatra.example.atmosphere

import org.junit.Assert._
import org.junit.Test
import scala.concurrent._
import scala.concurrent.duration._

class ScrollableFileTest {
  @Test
  def multipleLinesInBuffer() {
    val filename = this.getClass().getResource("LongTextUtf8.txt").toURI()
    println(filename)
    val f = new LineFile(filename, "UTF-8")
    for (l <- Await.result(f.readLines(Window(0,10000)), 100 seconds).buffer)
      println("Line: " + l)
  }

  /*@Test
  def multipleLinesInBuffer() {
    val filename = this.getClass().getResource("ShortTextUtf8.txt").getFile()
    val f = new ScrollableFile(filename, "UTF-8", 20)
    assertEquals(None, Await.result(f.up, 2 seconds))
    assertEquals(Some("0"), Await.result(f.down, 2 seconds))
    assertEquals(Some("2"), Await.result(f.down, 2 seconds))
    assertEquals(Some("4"), Await.result(f.down, 2 seconds))
    assertEquals(Some("6"), Await.result(f.down, 2 seconds))
    assertEquals(Some("6"), Await.result(f.up, 2 seconds))
    assertEquals(Some("4"), Await.result(f.up, 2 seconds))
    assertEquals(Some("4"), Await.result(f.down, 2 seconds))
    assertEquals(Some("6"), Await.result(f.down, 2 seconds))
    assertEquals(Some("6"), Await.result(f.up, 2 seconds))
    assertEquals(Some("4"), Await.result(f.up, 2 seconds))
    assertEquals(Some("2"), Await.result(f.up, 2 seconds))
    assertEquals(Some("0"), Await.result(f.up, 2 seconds))
    assertEquals(None, Await.result(f.up, 2 seconds))
    assertEquals(None, Await.result(f.up, 2 seconds))
    assertEquals(Some("0"), Await.result(f.down, 2 seconds))
    assertEquals(Some("2"), Await.result(f.down, 2 seconds))
    assertEquals(Some("4"), Await.result(f.down, 2 seconds))
    assertEquals(Some("6"), Await.result(f.down, 2 seconds))
    assertEquals(Some("8"), Await.result(f.down, 2 seconds))
    assertEquals(None, Await.result(f.down, 2 seconds))
    assertEquals(None, Await.result(f.down, 2 seconds))
    assertEquals(Some("8"), Await.result(f.up, 2 seconds))
    assertEquals(Some("8"), Await.result(f.down, 2 seconds))
  }

  @Test
  def fractionOfLinesInBuffer() {
    val filename = this.getClass().getResource("LongTextUtf16.txt").getFile()
    val f = new ScrollableFile(filename, "UTF-16", 20)
    assertEquals(None, Await.result(f.up, 2 seconds))
    assertEquals(Some("package org.scalatra.example.atmosphere"), Await.result(f.down, 2 seconds))
    assertEquals(Some(""), Await.result(f.down, 2 seconds))
    assertEquals(Some("; Default imports from a sto;ck Scalatra g8 code generator:"), Await.result(f.down, 2 seconds))
    assertEquals(Some("import org.;scalatra._"), Await.result(f.down, 2 seconds))
    assertEquals(Some("import org.;scalatra._"), Await.result(f.up, 2 seconds))
    assertEquals(Some("; Default imports from a sto;ck Scalatra g8 code generator:"), Await.result(f.up, 2 seconds))
    assertEquals(Some("; Default imports from a sto;ck Scalatra g8 code generator:"), Await.result(f.down, 2 seconds))
    assertEquals(Some("import org.;scalatra._"), Await.result(f.down, 2 seconds))
    assertEquals(Some("import org.;scalatra._"), Await.result(f.up, 2 seconds))
    assertEquals(Some("; Default imports from a sto;ck Scalatra g8 code generator:"), Await.result(f.up, 2 seconds))
    assertEquals(Some(""), Await.result(f.up, 2 seconds))
    assertEquals(Some("package org.scalatra.example.atmosphere"), Await.result(f.up, 2 seconds))
    assertEquals(None, Await.result(f.up, 2 seconds))
    assertEquals(None, Await.result(f.up, 2 seconds))
    assertEquals(Some("package org.scalatra.example.atmosphere"), Await.result(f.down, 2 seconds))
    assertEquals(Some(""), Await.result(f.down, 2 seconds))
    assertEquals(Some("; Default imports from a sto;ck Scalatra g8 code generator:"), Await.result(f.down, 2 seconds))
    assertEquals(Some("import org.;scalatra._"), Await.result(f.down, 2 seconds))
    assertEquals(None, Await.result(f.down, 2 seconds))
    assertEquals(None, Await.result(f.down, 2 seconds))
    assertEquals(Some("import org.;scalatra._"), Await.result(f.up, 2 seconds))
    assertEquals(Some("import org.;scalatra._"), Await.result(f.down, 2 seconds))
  }*/

}
