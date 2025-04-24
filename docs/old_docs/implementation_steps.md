# Command Sequence Implementation Steps

## 1. Update Command Definitions
Status: [ ] Not Started

### Actions:
1. Modify `src/constants/commands.ts`:
   ```typescript
   export const REQUIRED_COMMANDS: Command[] = [
     // Keep JOIN_TELEGRAM
     {
       command: 'JOIN_TELEGRAM',
       // ... existing implementation
     },
     // Keep SOL_WALLET but update description
     {
       command: 'SOL_WALLET <add wallet address>',
       description: 'Connect your Solana wallet and view referral program info',
       // ... rest of implementation
     },
     // Keep SUBMIT_REFERRAL but update description
     {
       command: 'SUBMIT_REFERRAL',
       description: 'Submit a referral code (or "no") and get your own code',
       // ... rest of implementation
     },
     // Keep SHARE
     {
       command: 'SHARE',
       // ... existing implementation
     },
     // Keep CLOSE
     {
       command: 'CLOSE',
       // ... existing implementation
     }
   ]
   ```

### Validation:
- [ ] All command references updated
- [ ] Command order preserved
- [ ] Descriptions accurate
- [ ] No broken references

## 2. Update SOL_WALLET Handler
Status: [ ] Not Started

### Actions:
1. Modify `src/components/TerminalModal.tsx`:
   ```typescript
   // Inside handleCommand when processing SOL_WALLET:
   if (currentCommand.command === 'SOL_WALLET') {
     const walletAddress = command.split(' ').slice(1).join(' ')
     
     // 1. Original wallet success message
     newLines.push({
       content: `[SUCCESS] Wallet address ${walletAddress} verified and stored successfully`,
       isSuccess: true
     })
     
     // 2. Automatically show referral info
     newLines.push({ 
       content: SYSTEM_MESSAGES.COMMAND_RESPONSES.REFERRAL_INFO,
       isSystem: true 
     })
     
     // 3. Update command responses to include both
     const updatedResponses = {
       ...commandResponses,
       'SOL_WALLET': walletAddress,
       'REFER': 'auto_completed'  // Mark as auto-completed
     }
     setCommandResponses(updatedResponses)
     
     // 4. Update completed commands
     const updatedCompletedCommands = [
       ...completedCommands, 
       'SOL_WALLET',
       'REFER'  // Add REFER as completed
     ]
     
     // 5. Save progress with both commands
     await saveProgress(currentCommandIndex + 2, updatedCompletedCommands)
     
     // 6. Update state
     setCompletedCommands(updatedCompletedCommands)
     setCurrentCommandIndex(currentCommandIndex + 2)
   }
   ```

### Validation:
- [ ] Wallet validation preserved
- [ ] Referral info shown correctly
- [ ] Progress saved properly
- [ ] Command sequence maintained
- [ ] Error handling intact

## 3. Update SUBMIT_REFERRAL Handler
Status: [ ] Not Started

### Actions:
1. Modify `src/components/TerminalModal.tsx`:
   ```typescript
   // Inside handleCommand when processing SUBMIT_REFERRAL:
   if (currentCommand.command === 'SUBMIT_REFERRAL') {
     try {
       // 1. Original referral validation
       const referralCode = extractReferralResponse(command)
       if (!referralCode) {
         throw new Error('Invalid referral code format')
       }

       // 2. Validate with API
       const validationResponse = await fetch('/api/validate-referral', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           userId: session.username,
           referralCode: referralCode
         })
       })

       if (!validationResponse.ok) {
         throw new Error('Invalid referral code')
       }

       // 3. Show success message
       newLines.push({
         content: "[SUCCESS] Referral code accepted",
         isSuccess: true
       })

       // 4. Automatically generate new referral code
       const generationResponse = await fetch('/api/referral-code', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ userId: session.username })
       })

       if (!generationResponse.ok) {
         throw new Error('Failed to generate referral code')
       }

       const { referralCode: generatedCode } = await generationResponse.json()

       // 5. Show generated code
       newLines.push({
         content: `[SUCCESS] Your unique referral code has been generated:\n\n${generatedCode}\n\nShare this code with others to earn rewards!`,
         isSuccess: true
       })

       // 6. Update command responses
       const updatedResponses = {
         ...commandResponses,
         'SUBMIT_REFERRAL': referralCode,
         'GENERATE_REFERRAL': generatedCode
       }
       setCommandResponses(updatedResponses)

       // 7. Update completed commands
       const updatedCompletedCommands = [
         ...completedCommands,
         'SUBMIT_REFERRAL',
         'GENERATE_REFERRAL'
       ]

       // 8. Save progress
       await saveProgress(currentCommandIndex + 2, updatedCompletedCommands)

       // 9. Update state
       setCompletedCommands(updatedCompletedCommands)
       setCurrentCommandIndex(currentCommandIndex + 2)

     } catch (error) {
       console.error('Failed to process referral:', error)
       newLines.push({
         content: `[ERROR] ${error.message}`,
         isError: true
       })
       setLines(newLines)
       return
     }
   }
   ```

### Validation:
- [ ] Referral validation preserved
- [ ] Code generation works
- [ ] Progress saved properly
- [ ] Command sequence maintained
- [ ] Error handling intact