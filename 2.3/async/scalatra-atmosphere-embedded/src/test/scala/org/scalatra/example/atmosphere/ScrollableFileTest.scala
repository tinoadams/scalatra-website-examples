package org.scalatra.example.atmosphere

import org.junit.Assert._
import org.junit.Test
import scala.concurrent._
import scala.concurrent.duration._

class ScrollableFileTest {
  def str(lines: Array[String]) = lines.foldLeft("") { case (acc, line) => acc + line.replace('\n', ' ').replace('\r', ' ') }

  @Test
  def multipleLinesInBuffer() {
    val filename = this.getClass().getResource("angular.js").toURI()
    println(filename)
    val start = 0
    val size = 64
    val f = new LineFile(filename, "UTF-8")
    // chunk with given size
    val b1 = Await.result(f.readLines(Window(start, start + size)), 10 seconds);
    // chunk with actual size returned by b1
    val b2 = Await.result(f.readLines(b1.window), 10 seconds);
//    println(b1.window)
//    println(b2.window)
    assertEquals(str(b1.buffer), str(b2.buffer))

//    // second chunk after b1
    val startAfterB1 = b1.window.end
    val end = startAfterB1 + size
    val b3 = Await.result(f.readLines(Window(startAfterB1, end)), 10 seconds);
    // whole chunk including b1
    val b4 = Await.result(f.readLines(Window(start, end)), 10 seconds);
    println(str(b1.buffer))
    println((" " * str(b1.buffer).length) + str(b3.buffer))
    println(str(b4.buffer))
    assertEquals(str(b1.buffer) + str(b3.buffer), str(b4.buffer))
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
