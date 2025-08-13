function formatVerboseOutput(jsonLine) {
  try {
    const data = JSON.parse(jsonLine);
    
    // System initialization
    if (data.type === 'system' && data.subtype === 'init') {
      return `🔧 System initialized\n   Session: ${data.session_id}\n   Model: ${data.model}`;
    }
    
    // Assistant messages (Claude's thinking/responses)
    if (data.type === 'assistant' && data.message) {
      const msg = data.message;
      let output = '';
      
      if (msg.content) {
        for (const content of msg.content) {
          if (content.type === 'text') {
            // Claude's text response - indent multiline text properly
            const lines = content.text.split('\n');
            if (lines.length === 1) {
              output += `\n💭 Claude: ${content.text}\n`;
            } else {
              output += `\n💭 Claude:\n`;
              lines.forEach(line => {
                output += `   ${line}\n`;
              });
            }
          } else if (content.type === 'tool_use') {
            // Tool usage - simplify MCP tool names
            const toolName = content.name
              .replace(/^mcp__[^_]+__/, '') // Remove MCP prefix
              .replace(/_/g, ' ')
              .replace(/\b\w/g, l => l.toUpperCase()); // Title case
            
            output += `\n🔧 Using tool: ${toolName}\n`;
            
            // Better parameter formatting
            if (content.input && Object.keys(content.input).length > 0) {
              const params = Object.entries(content.input)
                .filter(([k, v]) => {
                  // Skip common/redundant params
                  return k !== 'user_google_email' && 
                         v !== null && 
                         v !== undefined &&
                         v !== '';
                })
                .map(([k, v]) => {
                  // Format key nicely
                  const formattedKey = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  
                  // Format value based on type
                  let formattedValue;
                  if (typeof v === 'string' && v.length > 80) {
                    // Truncate long strings
                    formattedValue = `"${v.substring(0, 77)}..."`;
                  } else if (typeof v === 'object') {
                    // Compact JSON for objects/arrays
                    formattedValue = JSON.stringify(v);
                    if (formattedValue.length > 80) {
                      formattedValue = formattedValue.substring(0, 77) + '...';
                    }
                  } else {
                    formattedValue = JSON.stringify(v);
                  }
                  
                  return `   → ${formattedKey}: ${formattedValue}`;
                })
                .join('\n');
              
              if (params) output += params + '\n';
            }
          }
        }
      }
      
      return output;
    }
    
    // User messages (tool results) - MAIN IMPROVEMENTS HERE
    if (data.type === 'user' && data.message) {
      const msg = data.message;
      if (msg.content) {
        let output = '';
        
        for (const content of msg.content) {
          if (content.type === 'tool_result') {
            output += `\n📊 Tool Result`;
            
            // Add tool name if available
            if (content.tool_use_id) {
              output += ` [${content.tool_use_id.substring(0, 8)}]`;
            }
            output += ':\n';
            
            // Handle errors first
            if (content.is_error) {
              output += `   ❌ Error: ${content.error || 'Unknown error'}\n`;
              if (content.error_details) {
                output += `   Details: ${content.error_details}\n`;
              }
              continue;
            }
            
            // Process content items
            if (content.content && Array.isArray(content.content)) {
              for (const item of content.content) {
                if (item.type === 'text' && item.text) {
                  const text = item.text.trim();
                  
                  // Try to detect and format different content types
                  output += formatToolResultText(text);
                  
                } else if (item.type === 'image') {
                  output += `   📷 [Image content]\n`;
                } else if (item.type === 'document') {
                  output += `   📄 [Document: ${item.name || 'unnamed'}]\n`;
                } else {
                  // Show any other content types with better formatting
                  output += `   ℹ️ [${item.type}]: ${JSON.stringify(item).substring(0, 100)}\n`;
                }
              }
            } else if (content.content) {
              // Non-array content
              output += `   ${JSON.stringify(content.content, null, 2).split('\n').join('\n   ')}\n`;
            }
          }
        }
        
        if (output) return output.trimEnd();
      }
    }
    
    // Final result
    if (data.type === 'result') {
      let output = '';
      if (data.is_error) {
        output = `\n❌ Error: ${data.result || 'Unknown error'}`;
        if (data.error_code) {
          output += ` (Code: ${data.error_code})`;
        }
      } else {
        output = `\n✅ Success`;
        if (data.duration_ms) {
          const seconds = (data.duration_ms / 1000).toFixed(1);
          output += ` (${seconds}s)`;
        }
        if (data.total_cost_usd) {
          output += ` - Cost: $${data.total_cost_usd.toFixed(4)}`;
        }
        if (data.tokens_used) {
          output += ` - Tokens: ${data.tokens_used.toLocaleString()}`;
        }
      }
      return output;
    }
    
    // Show any unhandled event types more concisely
    if (data.type && !['system', 'assistant', 'user', 'result'].includes(data.type)) {
      return `\n🔍 [${data.type}] ${JSON.stringify(data).substring(0, 100)}`;
    }
    
    return null; // Skip truly unknown events
    
  } catch (e) {
    // Not JSON or parsing error
    return null;
  }
}

// Helper function to format tool result text based on content type
function formatToolResultText(text) {
  let output = '';
  
  // 1. Try to parse as JSON for structured data
  try {
    const jsonData = JSON.parse(text);
    
    // Handle different JSON structures
    if (Array.isArray(jsonData)) {
      // Arrays - format based on content
      if (jsonData.length === 0) {
        output += `   📋 Empty list\n`;
      } else if (jsonData.length > 10) {
        output += `   📋 List (${jsonData.length} items):\n`;
        // Show first 5 and last 2
        jsonData.slice(0, 5).forEach((item, i) => {
          output += formatJsonItem(item, i + 1);
        });
        output += `   ... (${jsonData.length - 7} more items)\n`;
        jsonData.slice(-2).forEach((item, i) => {
          output += formatJsonItem(item, jsonData.length - 1 + i);
        });
      } else {
        output += `   📋 List (${jsonData.length} items):\n`;
        jsonData.forEach((item, i) => {
          output += formatJsonItem(item, i + 1);
        });
      }
    } else if (typeof jsonData === 'object' && jsonData !== null) {
      // Objects - format key-value pairs nicely
      const entries = Object.entries(jsonData);
      if (entries.length === 0) {
        output += `   📦 Empty object\n`;
      } else {
        output += `   📦 Data:\n`;
        entries.forEach(([key, value]) => {
          const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          output += formatKeyValue(formattedKey, value);
        });
      }
    } else {
      // Primitive values
      output += `   → ${JSON.stringify(jsonData)}\n`;
    }
    
    return output;
    
  } catch {
    // Not JSON - check for special formats
    
    // 2. WhatsApp message format
    // Look for WhatsApp-style timestamps [MM-DD HH:MM] or chat separators
    if ((text.includes('[') && text.match(/\[\d{2}-\d{2}\s+\d{2}:\d{2}/)) || 
        text.includes('┌─') || 
        text.includes('→')) {
      return formatWhatsAppMessages(text);
    }
    
    // 3. Email/Calendar format
    if (text.includes('Subject:') || text.includes('From:') || text.includes('Start:')) {
      return formatEmailOrCalendar(text);
    }
    
    // 4. File listing format
    if (text.includes('Type:') && (text.includes('File') || text.includes('Folder'))) {
      return formatFileListing(text);
    }
    
    // 5. Multi-line text
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length > 1) {
      if (lines.length > 20) {
        // Truncate very long outputs
        output += `   📝 Output (${lines.length} lines):\n`;
        lines.slice(0, 10).forEach(line => {
          output += `   ${line.substring(0, 100)}\n`;
        });
        output += `   ... (${lines.length - 12} more lines)\n`;
        lines.slice(-2).forEach(line => {
          output += `   ${line.substring(0, 100)}\n`;
        });
      } else {
        lines.forEach(line => {
          output += `   ${line}\n`;
        });
      }
    } else if (text) {
      // Single line
      output += `   → ${text.substring(0, 200)}\n`;
    }
  }
  
  return output;
}

// Helper to format individual JSON items
function formatJsonItem(item, index) {
  if (typeof item === 'object' && item !== null) {
    // For objects, show key fields
    const summary = [];
    ['name', 'title', 'id', 'email', 'message', 'text'].forEach(key => {
      if (item[key]) {
        summary.push(`${key}: ${String(item[key]).substring(0, 50)}`);
      }
    });
    if (summary.length > 0) {
      return `   ${index}. ${summary.join(', ')}\n`;
    }
    return `   ${index}. ${JSON.stringify(item).substring(0, 100)}\n`;
  }
  return `   ${index}. ${String(item).substring(0, 100)}\n`;
}

// Helper to format key-value pairs
function formatKeyValue(key, value) {
  let formattedValue;
  if (value === null || value === undefined) {
    formattedValue = 'null';
  } else if (typeof value === 'boolean') {
    formattedValue = value ? '✓' : '✗';
  } else if (typeof value === 'number') {
    formattedValue = value.toLocaleString();
  } else if (typeof value === 'string') {
    if (value.length > 100) {
      formattedValue = `"${value.substring(0, 97)}..."`;
    } else {
      formattedValue = `"${value}"`;
    }
  } else if (Array.isArray(value)) {
    formattedValue = `[${value.length} items]`;
  } else if (typeof value === 'object') {
    const keys = Object.keys(value);
    formattedValue = `{${keys.length} fields}`;
  } else {
    formattedValue = String(value);
  }
  
  return `      • ${key}: ${formattedValue}\n`;
}

// Format WhatsApp messages
function formatWhatsAppMessages(text) {
  let output = `   💬 WhatsApp Messages:\n\n`;
  const lines = text.split('\n');
  
  let currentChat = null;
  const messages = [];
  
  // Parse all messages first to group by chat
  lines.forEach(line => {
    if (!line.trim()) return;
    
    // Check for chat header format: "┌─ ChatName" or similar
    if (line.includes('┌─') || line.includes('───')) {
      const chatMatch = line.match(/┌─\s*(.+)/);
      if (chatMatch) {
        currentChat = chatMatch[1].trim();
      }
      return;
    }
    
    // Parse new format: [MM-DD HH:MM sender] message or [MM-DD HH:MM] → message
    const msgMatch = line.match(/^\s*[│|]?\s*\[(\d{2}-\d{2}\s+\d{2}:\d{2})(?:\s+([^\]]+))?\]\s*(.*)/);
    if (msgMatch) {
      const [, timestamp, sender, messageText] = msgMatch;
      
      messages.push({
        chat: currentChat || 'Unknown',
        timestamp: timestamp.trim(),
        sender: sender ? sender.trim() : 'Me',
        message: messageText.replace(/^→\s*/, '').trim(),
        isOutgoing: !sender || messageText.startsWith('→')
      });
    } else if (line.includes('[') && line.includes(']')) {
      // Try to extract any bracketed content as a message
      const fallbackMatch = line.match(/\[([^\]]+)\]\s*(.*)/);
      if (fallbackMatch) {
        messages.push({
          chat: currentChat || 'Unknown',
          timestamp: '',
          sender: 'Unknown',
          message: line.trim(),
          isOutgoing: line.includes('→')
        });
      }
    }
  });
  
  // Group messages by chat
  const chatGroups = {};
  messages.forEach(msg => {
    if (!chatGroups[msg.chat]) {
      chatGroups[msg.chat] = [];
    }
    chatGroups[msg.chat].push(msg);
  });
  
  // Format output by chat
  Object.entries(chatGroups).forEach(([chat, msgs]) => {
    output += `   ┌─ ${chat}\n`;
    
    msgs.forEach(msg => {
      if (msg.isOutgoing) {
        output += `   │ [${msg.timestamp}] → ${msg.message}\n`;
      } else {
        output += `   │ [${msg.timestamp} ${msg.sender}] ${msg.message}\n`;
      }
    });
    
    output += `\n`;
  });
  
  return output;
}

// Format email or calendar entries
function formatEmailOrCalendar(text) {
  let output = `   📧 Message Details:\n`;
  const lines = text.split('\n');
  
  lines.forEach(line => {
    if (!line.trim()) return;
    
    // Look for common email/calendar fields
    if (line.startsWith('Subject:') || 
        line.startsWith('From:') || 
        line.startsWith('To:') ||
        line.startsWith('Start:') ||
        line.startsWith('End:') ||
        line.startsWith('Location:')) {
      output += `      • ${line.trim()}\n`;
    } else if (line.startsWith('Body:') || line.startsWith('Description:')) {
      const content = line.substring(line.indexOf(':') + 1).trim();
      output += `      • ${line.split(':')[0]}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n`;
    } else {
      output += `      ${line.substring(0, 100)}\n`;
    }
  });
  
  return output;
}

// Format file listings
function formatFileListing(text) {
  let output = `   📁 Files:\n`;
  const lines = text.split('\n');
  
  lines.forEach(line => {
    if (!line.trim()) return;
    
    // Parse file listing format
    if (line.includes('Type:')) {
      const parts = line.split(',').map(p => p.trim());
      const name = parts.find(p => p.startsWith('Name:'))?.replace('Name:', '').trim();
      const type = parts.find(p => p.startsWith('Type:'))?.replace('Type:', '').trim();
      const size = parts.find(p => p.startsWith('Size:'))?.replace('Size:', '').trim();
      
      if (type === 'Folder') {
        output += `      📁 ${name}/\n`;
      } else {
        output += `      📄 ${name}${size ? ` (${size})` : ''}\n`;
      }
    } else {
      output += `      ${line.substring(0, 100)}\n`;
    }
  });
  
  return output;
}

export { formatVerboseOutput, formatToolResultText };